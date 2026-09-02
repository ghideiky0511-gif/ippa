import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { createPaymentProvider } from "@/payments/registry";
import {
    listVisiblePaymentProviderCatalog,
    type PaymentProviderCatalogEntry,
    type PaymentProviderCredentialField,
} from "@/payments/providerCatalog";
import {
    activatePaymentIntegrationRow,
    deactivatePaymentIntegrationRow,
    findPaymentIntegrationRowByProvider,
    listPaymentIntegrationRows,
    upsertPaymentIntegrationCredentialsRow,
    type PaymentIntegrationRow,
} from "@/models/paymentIntegrationsModel";
import {
    recordAuditEvent,
    PAYMENT_INTEGRATION_AUDIT_ACTIONS,
    type AuditRequestContext,
} from "@/services/audit";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { NotFoundError, ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";

// Espelha erp/erpIntegrationService.ts (mesmo desenho: catálogo estático +
// registry puro + uma linha por (tenant_id, provider) só ativável depois de
// credenciais salvas). Duas diferenças por conta da natureza dos segredos
// aqui (movimentam dinheiro, não só leem/escrevem catálogo/pedido do ERP):
// 1) credenciais vão cifradas (ver models/paymentIntegrationsModel.ts);
// 2) `credentials` devolvido pro chamador nunca inclui NENHUM campo salvo
//    (nem os não-secretos) -- diferente do ERP, que devolve os campos
//    "text"/"number" salvos para não obrigar redigitar tudo a cada edição.
//    Aqui todo campo precisa ser redigitado a cada salvamento, por segurança.

export interface TenantPaymentIntegrationOption {
    provider: string;
    label: string;
    description: string;
    logoPath?: string;
    credentialFields: PaymentProviderCredentialField[];
    onboardingType?: "credentials" | "redirect";
    configured: boolean;
    active: boolean;
    // Estado público para o próprio administrador do tenant. Não expõe
    // segredo algum: o acct_xxx é o identificador da connected account, não
    // uma chave de API (a secret key permanece exclusivamente na plataforma).
    stripeAccountId?: string | null;
    stripeOnboardingStatus?: "pending" | "complete" | "restricted" | null;
    stripeApiVersion?: "v2" | null;
    // Espelha stripeAccountId: id do vendedor Mercado Pago, só exibição
    // (não é segredo, ver models/paymentIntegrationsModel.ts).
    mercadoPagoUserId?: string | null;
    updatedAt: string | null;
}

function findVisibleCatalogEntry(provider: string): PaymentProviderCatalogEntry {
    const entry = listVisiblePaymentProviderCatalog().find(
        (candidate) => candidate.code === provider,
    );
    if (!entry)
        throw new ValidationError(
            "INVALID_INPUT",
            `Provider de pagamento desconhecido: ${provider}.`,
        );
    return entry;
}

function toOption(
    entry: PaymentProviderCatalogEntry,
    row?: PaymentIntegrationRow | null,
): TenantPaymentIntegrationOption {
    return {
        provider: entry.code,
        label: entry.label,
        description: entry.description,
        logoPath: entry.logoPath,
        credentialFields: entry.credentialFields,
        onboardingType: entry.onboardingType,
        configured: Boolean(row),
        active: row?.active ?? false,
        stripeAccountId: entry.code === "stripe" ? row?.stripe_account_id ?? null : undefined,
        stripeOnboardingStatus:
            entry.code === "stripe"
                ? (row?.stripe_onboarding_status as TenantPaymentIntegrationOption["stripeOnboardingStatus"])
                : undefined,
        stripeApiVersion:
            entry.code === "stripe"
                ? row?.stripe_api_version ?? null
                : undefined,
        mercadoPagoUserId: entry.code === "mercadopago" ? row?.mercadopago_user_id ?? null : undefined,
        updatedAt: row ? row.updated_at.toISOString() : null,
    };
}

// Valida o rascunho de credenciais contra o catálogo (obrigatórios
// preenchidos, "number"/"number-list" parseáveis) e já devolve no formato
// que os providers esperam -- mesmo raciocínio de erpIntegrationService.
function parseCredentials(
    entry: PaymentProviderCatalogEntry,
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

export async function listTenantPaymentIntegrations(
    tenant: Tenant,
    user: AuthUser,
): Promise<{ options: TenantPaymentIntegrationOption[] }> {
    requireSettingsAdministrator(user);
    return withTenantTransaction(tenant, user, async (client) => {
        const rows = await listPaymentIntegrationRows(client);
        const rowByProvider = new Map(rows.map((row) => [row.provider, row]));
        const options = listVisiblePaymentProviderCatalog().map((entry) =>
            toOption(entry, rowByProvider.get(entry.code)),
        );
        return { options };
    });
}

// Salva/atualiza credenciais de um provider -- não ativa (ver
// activateTenantPaymentIntegration). Todo campo precisa ser redigitado por
// completo a cada chamada (ver nota no topo do arquivo).
export async function saveTenantPaymentIntegrationCredentials(
    tenant: Tenant,
    user: AuthUser,
    provider: string,
    rawCredentials: Record<string, unknown>,
    context: AuditRequestContext,
): Promise<TenantPaymentIntegrationOption> {
    requireSettingsAdministrator(user);
    const entry = findVisibleCatalogEntry(provider);
    if (entry.onboardingType === "redirect") {
        throw new ValidationError(
            "PAYMENT_INTEGRATION_ONBOARDING_REQUIRED",
            "Conclua o onboarding hospedado da Stripe para conectar esta conta.",
        );
    }
    const credentials = parseCredentials(entry, rawCredentials ?? {});
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await upsertPaymentIntegrationCredentialsRow(client, {
            provider,
            credentials,
            credentialsMeta: {},
        });
        await recordAuditEvent(client, {
            action: PAYMENT_INTEGRATION_AUDIT_ACTIONS.CONFIGURED,
            entityId: row.id,
            actor: user,
            context,
            metadata: { provider },
        });
        return toOption(entry, row);
    });
}

export async function activateTenantPaymentIntegration(
    tenant: Tenant,
    user: AuthUser,
    provider: string,
    context: AuditRequestContext,
): Promise<TenantPaymentIntegrationOption> {
    requireSettingsAdministrator(user);
    const entry = findVisibleCatalogEntry(provider);
    if (entry.onboardingType === "redirect") {
        throw new ValidationError(
            "PAYMENT_INTEGRATION_ONBOARDING_REQUIRED",
            "A Stripe é ativada automaticamente quando o onboarding for concluído.",
        );
    }
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await activatePaymentIntegrationRow(client, provider);
        if (!row)
            throw new ValidationError(
                "PAYMENT_INTEGRATION_NOT_CONFIGURED",
                "Salve as credenciais deste provider antes de ativá-lo.",
            );
        await recordAuditEvent(client, {
            action: PAYMENT_INTEGRATION_AUDIT_ACTIONS.ACTIVATED,
            entityId: row.id,
            actor: user,
            context,
            metadata: { provider },
        });
        return toOption(entry, row);
    });
}

// Desliga o gateway inteiro (nenhum provider ativo) sem apagar credenciais
// salvas -- idempotente, não é erro chamar sem nada ativo.
export async function deactivateTenantPaymentIntegration(
    tenant: Tenant,
    user: AuthUser,
    context: AuditRequestContext,
): Promise<{ deactivated: boolean }> {
    requireSettingsAdministrator(user);
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await deactivatePaymentIntegrationRow(client);
        if (row) {
            await recordAuditEvent(client, {
                action: PAYMENT_INTEGRATION_AUDIT_ACTIONS.DEACTIVATED,
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
// está salvo para esse provider. Nunca lança por falha de conexão -- sempre
// devolve { ok, message }, igual ao app de referência.
export async function testTenantPaymentIntegrationConnection(
    tenant: Tenant,
    user: AuthUser,
    provider: string,
    rawCredentials?: Record<string, unknown>,
): Promise<{ ok: boolean; message?: string }> {
    requireSettingsAdministrator(user);
    const entry = findVisibleCatalogEntry(provider);

    let credentials: Record<string, unknown>;
    if (rawCredentials) {
        if (entry.onboardingType === "redirect") {
            throw new ValidationError(
                "PAYMENT_INTEGRATION_ONBOARDING_REQUIRED",
                "Conclua o onboarding hospedado da Stripe antes de testar a conexão.",
            );
        }
        credentials = parseCredentials(entry, rawCredentials);
    } else {
        const stored = await withTenantTransaction(tenant, user, (client) =>
            findPaymentIntegrationRowByProvider(client, provider),
        );
        if (!stored) throw new NotFoundError("PAYMENT_INTEGRATION_NOT_CONFIGURED");
        if (entry.onboardingType === "redirect") {
            if (provider === "stripe") {
                if (!stored.stripe_account_id) {
                    return { ok: false, message: "Conecte uma conta Stripe antes de testar a conexão." };
                }
                credentials = { stripeAccountId: stored.stripe_account_id };
            } else if (provider === "mercadopago") {
                if (!stored.mercadopago_user_id) {
                    return { ok: false, message: "Conecte uma conta Mercado Pago antes de testar a conexão." };
                }
                // stored.credentials já vem decifrado pelo model
                // (accessToken/refreshToken/expiresAt) -- teste manual não
                // passa por resolveProviderCredentials de propósito (sem o
                // efeito colateral de renovar+regravar token só por causa de
                // um clique de "testar conexão"; um token expirado falhando
                // o teste com mensagem clara já é UX aceitável aqui).
                credentials = { ...stored.credentials, userId: stored.mercadopago_user_id };
            } else {
                return { ok: false, message: "Provider não suporta teste de conexão." };
            }
        } else {
            credentials = stored.credentials;
        }
    }

    try {
        const provider_ = createPaymentProvider(
            provider,
            credentials,
            createExternalApiCallReporter(tenant, user, provider),
        );
        if (!provider_.testConnection) return { ok: true };
        const result = await provider_.testConnection();
        if (!result.ok) {
            logger.warn(
                "payment-integration-test",
                "Teste de conexão retornou falha",
                { tenantId: tenant.id, provider, message: result.message },
            );
        }
        return result;
    } catch (exc) {
        logger.error(
            "payment-integration-test",
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
