import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { createErpProvider } from "@/erp/registry";
import {
    listVisibleErpProviderCatalog,
    type ErpProviderCatalogEntry,
    type ErpProviderCredentialField,
} from "@/erp/providerCatalog";
import {
    activateErpIntegrationRow,
    deactivateErpIntegrationRow,
    findErpIntegrationRowByProvider,
    listErpIntegrationRows,
    upsertErpIntegrationCredentialsRow,
    type ErpIntegrationRow,
} from "@/models/erpIntegrationsModel";
import {
    recordAuditEvent,
    ERP_INTEGRATION_AUDIT_ACTIONS,
    type AuditRequestContext,
} from "@/services/audit";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { NotFoundError, ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";
import { upsertCatalogSyncConfigRow } from "@/models/catalogSyncModel";

// Uma opção por provider visível no catálogo, com o estado do tenant
// mesclado por cima. `credentials` só carrega campos não-secretos (ver
// redactedCredentials) — client secret/senha nunca voltam pro chamador,
// precisam ser redigitados a cada edição.
export interface TenantErpIntegrationOption {
    provider: string;
    label: string;
    description: string;
    logoPath?: string;
    credentialFields: ErpProviderCredentialField[];
    configured: boolean;
    active: boolean;
    updatedAt: string | null;
    credentials: Record<string, unknown>;
}

function findVisibleCatalogEntry(provider: string): ErpProviderCatalogEntry {
    const entry = listVisibleErpProviderCatalog().find(
        (candidate) => candidate.code === provider,
    );
    if (!entry)
        throw new ValidationError(
            "INVALID_INPUT",
            `Provider de ERP desconhecido: ${provider}.`,
        );
    return entry;
}

function redactedCredentials(
    entry: ErpProviderCatalogEntry,
    stored: Record<string, unknown>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const field of entry.credentialFields) {
        if (field.type === "password") continue;
        if (field.key in stored) result[field.key] = stored[field.key];
    }
    return result;
}

function toOption(
    entry: ErpProviderCatalogEntry,
    row?: ErpIntegrationRow | null,
): TenantErpIntegrationOption {
    return {
        provider: entry.code,
        label: entry.label,
        description: entry.description,
        logoPath: entry.logoPath,
        credentialFields: entry.credentialFields,
        configured: Boolean(row),
        active: row?.active ?? false,
        updatedAt: row ? row.updated_at.toISOString() : null,
        credentials: row ? redactedCredentials(entry, row.credentials) : {},
    };
}

// Valida o rascunho de credenciais contra o catálogo (obrigatórios
// preenchidos, "number"/"number-list" parseáveis) e já devolve no formato
// que os providers esperam (branchCode: number, priceCodeList: number[]...).
function parseCredentials(
    entry: ErpProviderCatalogEntry,
    raw: Record<string, unknown>,
): Record<string, unknown> {
    const credentials: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const field of entry.credentialFields) {
        const text = String(raw?.[field.key] ?? "").trim();
        if (!text) {
            if (field.required) errors.push(`${field.label} é obrigatório.`);
            continue;
        }
        if (field.type === "number") {
            const value = Number(text);
            if (!Number.isFinite(value)) {
                errors.push(`${field.label} deve ser um número.`);
                continue;
            }
            credentials[field.key] = value;
        } else if (field.type === "number-list") {
            const values = text
                .split(",")
                .map((part) => Number(part.trim()))
                .filter((value) => Number.isFinite(value));
            if (values.length === 0) {
                errors.push(
                    `${field.label} deve conter números separados por vírgula.`,
                );
                continue;
            }
            credentials[field.key] = values;
        } else {
            credentials[field.key] = text;
        }
    }

    if (errors.length > 0)
        throw new ValidationError("INVALID_INPUT", errors.join(" "));
    return credentials;
}

export async function listTenantErpIntegrations(
    tenant: Tenant,
    user: AuthUser,
): Promise<{ options: TenantErpIntegrationOption[] }> {
    requireSettingsAdministrator(user);
    return withTenantTransaction(tenant, user, async (client) => {
        const rows = await listErpIntegrationRows(client);
        const rowByProvider = new Map(rows.map((row) => [row.provider, row]));
        const options = listVisibleErpProviderCatalog().map((entry) =>
            toOption(entry, rowByProvider.get(entry.code)),
        );
        return { options };
    });
}

// Salva/atualiza credenciais de um provider — não ativa (ver
// activateTenantErpIntegration). Client secret/senha precisam ser
// redigitados por completo a cada chamada, nunca são preenchidos a partir
// do que já está salvo.
export async function saveTenantErpIntegrationCredentials(
    tenant: Tenant,
    user: AuthUser,
    provider: string,
    rawCredentials: Record<string, unknown>,
    context: AuditRequestContext,
): Promise<TenantErpIntegrationOption> {
    requireSettingsAdministrator(user);
    const entry = findVisibleCatalogEntry(provider);
    const credentials = parseCredentials(entry, rawCredentials ?? {});
    if (
        provider === "totvsmoda"
        && String(credentials.classificationCodes ?? "").split(",").every((code) => !code.trim())
    ) {
        throw new ValidationError(
            "INVALID_INPUT",
            "Informe ao menos uma classificação que publica o produto.",
        );
    }
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await upsertErpIntegrationCredentialsRow(client, {
            provider,
            credentials,
        });
        if (provider === "totvsmoda") {
            const classificationTypeCode = Number(credentials.classificationTypeCode);
            const classificationCodes = String(credentials.classificationCodes ?? "")
                .split(",")
                .map((code) => code.trim())
                .filter(Boolean);
            await upsertCatalogSyncConfigRow(client, {
                integrationId: row.id,
                enabled: Number.isFinite(classificationTypeCode) && classificationCodes.length > 0,
                classificationTypeCode,
                classificationCodes,
            });
        }
        await recordAuditEvent(client, {
            action: ERP_INTEGRATION_AUDIT_ACTIONS.CONFIGURED,
            entityId: row.id,
            actor: user,
            context,
            metadata: { provider },
        });
        return toOption(entry, row);
    });
}

export async function activateTenantErpIntegration(
    tenant: Tenant,
    user: AuthUser,
    provider: string,
    context: AuditRequestContext,
): Promise<TenantErpIntegrationOption> {
    requireSettingsAdministrator(user);
    const entry = findVisibleCatalogEntry(provider);
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await activateErpIntegrationRow(client, provider);
        if (!row)
            throw new ValidationError(
                "ERP_INTEGRATION_NOT_CONFIGURED",
                "Salve as credenciais deste provider antes de ativá-lo.",
            );
        await recordAuditEvent(client, {
            action: ERP_INTEGRATION_AUDIT_ACTIONS.ACTIVATED,
            entityId: row.id,
            actor: user,
            context,
            metadata: { provider },
        });
        return toOption(entry, row);
    });
}

// Desliga o ERP inteiro (nenhum provider ativo) sem apagar credenciais
// salvas — idempotente, não é erro chamar sem nada ativo.
export async function deactivateTenantErpIntegration(
    tenant: Tenant,
    user: AuthUser,
    context: AuditRequestContext,
): Promise<{ deactivated: boolean }> {
    requireSettingsAdministrator(user);
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await deactivateErpIntegrationRow(client);
        if (row) {
            await recordAuditEvent(client, {
                action: ERP_INTEGRATION_AUDIT_ACTIONS.DEACTIVATED,
                entityId: row.id,
                actor: user,
                context,
                metadata: { provider: row.provider },
            });
        }
        return { deactivated: Boolean(row) };
    });
}

// Testa a conexão sem exigir que o provider esteja ativo. Se `rawCredentials`
// vier preenchido, testa o rascunho (nada é salvo); senão, testa o que já
// está salvo para esse provider. Nunca lança por falha de conexão — sempre
// devolve { ok, message }, igual ao app de referência (a rota responde 200
// com o resultado do teste).
export async function testTenantErpIntegrationConnection(
    tenant: Tenant,
    user: AuthUser,
    provider: string,
    rawCredentials?: Record<string, unknown>,
): Promise<{ ok: boolean; message?: string }> {
    requireSettingsAdministrator(user);
    const entry = findVisibleCatalogEntry(provider);

    let credentials: Record<string, unknown>;
    if (rawCredentials) {
        credentials = parseCredentials(entry, rawCredentials);
    } else {
        const stored = await withTenantTransaction(tenant, user, (client) =>
            findErpIntegrationRowByProvider(client, provider),
        );
        if (!stored) throw new NotFoundError("ERP_INTEGRATION_NOT_CONFIGURED");
        credentials = stored.credentials;
    }

    try {
        const erpProvider = createErpProvider(
            provider,
            credentials,
            createExternalApiCallReporter(tenant, user, provider),
        );
        if (!erpProvider.testConnection) return { ok: true };
        const result = await erpProvider.testConnection();
        if (!result.ok) {
            logger.warn(
                "erp-integration-test",
                "Teste de conexão retornou falha",
                { tenantId: tenant.id, provider, message: result.message },
            );
        }
        return result;
    } catch (exc) {
        logger.error(
            "erp-integration-test",
            "Teste de conexão lançou exceção",
            { tenantId: tenant.id, provider, ...errorMeta(exc) },
        );
        return {
            ok: false,
            message:
                exc instanceof Error
                    ? exc.message
                    : "Falha desconhecida ao testar a conexão.",
        };
    }
}
