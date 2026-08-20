import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Client } from "@/lib/types";
import {
    findClientRow,
    findClientRowByDocumentDigits,
    insertClientRow,
    searchClientRows,
    searchClientRowsPage,
    updateClientRow,
} from "@/models/clientsModel";
import { findUserRowByClientId } from "@/models/usersModel";
import { findActiveErpIntegrationRow } from "@/models/erpIntegrationsModel";
import { upsertExternalReferenceRow } from "@/models/erpExternalReferencesModel";
import { createErpProvider } from "@/erp/registry";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { recordAuditEvent, CLIENT_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ConflictError, ForbiddenError, ValidationError } from "@/services/shared/errors";
import { toClient } from "./clientMapper";

const AUDITED_CLIENT_FIELDS = [
    "name", "cpfCnpj", "email", "cep", "street", "number", "complement",
    "neighborhood", "city", "state", "companyResponsible", "storeName",
] as const;

function canManageClients(user: AuthUser): boolean {
    return user.role !== "cliente";
}

function documentDigits(value: string): string {
    return value.replace(/\D/g, "");
}

export async function searchTenantClients(tenant: Tenant, user: AuthUser, query?: string): Promise<Client[]> {
    if (!canManageClients(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) =>
        (await searchClientRows(client, query?.trim() || null)).map(toClient),
    );
}

export interface AdministrativeClientsPage {
    clients: Client[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
    kpis: { newThisMonth: number; withEmail: number; withAddress: number };
}

export async function searchAdministrativeClients(tenant: Tenant, user: AuthUser, query?: string, requestedPage?: number, requestedPageSize?: number): Promise<AdministrativeClientsPage> {
    if (!canManageClients(user)) throw new ForbiddenError();
    const pageSize = Math.min(Math.max(requestedPageSize || 20, 10), 100);
    const page = Math.max(requestedPage || 1, 1);
    return withTenantTransaction(tenant, user, async (client) => {
        const result = await searchClientRowsPage(client, query?.trim() || null, page, pageSize);
        return {
            clients: result.rows.map(toClient),
            pagination: { page, pageSize, total: result.total, totalPages: Math.max(Math.ceil(result.total / pageSize), 1) },
            kpis: { newThisMonth: result.newThisMonth, withEmail: result.withEmail, withAddress: result.withAddress },
        };
    });
}

export async function getTenantClient(tenant: Tenant, user: AuthUser, id: string): Promise<(Client & { hasLogin: boolean }) | null> {
    if (!canManageClients(user) && user.clientId !== id) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await findClientRow(client, id);
        if (!row) return null;
        return { ...toClient(row), hasLogin: Boolean(await findUserRowByClientId(client, id)) };
    });
}

export async function createTenantClient(
    tenant: Tenant,
    user: AuthUser,
    value: { name?: unknown; cpfCnpj?: unknown },
    context: AuditRequestContext,
): Promise<Client> {
    if (!canManageClients(user)) throw new ForbiddenError();
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const cpfCnpj = typeof value.cpfCnpj === "string" ? value.cpfCnpj.trim() || undefined : undefined;
    if (!name) throw new ValidationError();
    return withTenantTransaction(tenant, user, async (client) => {
        const digits = cpfCnpj ? documentDigits(cpfCnpj) : "";
        if (digits && await findClientRowByDocumentDigits(client, digits)) {
            throw new ConflictError("DOCUMENT_TAKEN");
        }
        const created = toClient(await insertClientRow(client, {
            name,
            cpfCnpj,
            lastSellerId: user.id,
        }));
        await recordAuditEvent(client, {
            action: CLIENT_AUDIT_ACTIONS.CREATED,
            entityId: created.id,
            actor: user,
            context,
        });
        return created;
    });
}

export async function updateTenantClient(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    value: Partial<Client>,
    context: AuditRequestContext,
): Promise<Client | null> {
    if (!canManageClients(user) && user.clientId !== id) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const currentRow = await findClientRow(client, id);
        if (!currentRow) return null;
        const current = toClient(currentRow);
        const merged = { ...current, ...value };
        const digits = merged.cpfCnpj ? documentDigits(merged.cpfCnpj) : "";
        if (digits) {
            const existing = await findClientRowByDocumentDigits(client, digits);
            if (existing && existing.id !== id) throw new ConflictError("DOCUMENT_TAKEN");
        }
        const row = await updateClientRow(client, id, {
            ...merged,
            name: merged.name.trim(),
        });
        if (!row) return null;
        const changedFields = AUDITED_CLIENT_FIELDS.filter((field) => Object.hasOwn(value, field));
        await recordAuditEvent(client, {
            action: CLIENT_AUDIT_ACTIONS.UPDATED,
            entityId: id,
            actor: user,
            context,
            metadata: { changedFields },
        });
        return toClient(row);
    });
}

export interface ClientLookupResult {
    client: Client | null;
    source: "local" | "erp" | "not_found";
}

// Fluxo do talão: vendedor busca por CPF/CNPJ exato. Cadastro local do
// tenant tem prioridade; só se não existir é que tenta importar do ERP
// ativo (se houver um configurado). Não encontrar em nenhum dos dois não é
// erro — o vendedor cadastra manualmente, como sempre foi. Cadastro
// completo de cliente diretamente no ERP (quando também não existe lá)
// fica fora de escopo por ora.
export async function findOrImportTenantClientByDocument(
    tenant: Tenant,
    user: AuthUser,
    document: string,
    context: AuditRequestContext,
): Promise<ClientLookupResult> {
    if (!canManageClients(user)) throw new ForbiddenError();
    const digits = documentDigits(document);
    if (digits.length !== 11 && digits.length !== 14) {
        throw new ValidationError("INVALID_DOCUMENT", "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.");
    }

    return withTenantTransaction(tenant, user, async (client) => {
        const localRow = await findClientRowByDocumentDigits(client, digits);
        if (localRow) return { client: toClient(localRow), source: "local" };

        const integration = await findActiveErpIntegrationRow(client);
        if (!integration) return { client: null, source: "not_found" };

        const provider = createErpProvider(
            integration.provider, integration.credentials,
            createExternalApiCallReporter(tenant, user, integration.provider),
        );
        if (!provider.lookupClientByDocument) return { client: null, source: "not_found" };

        const found = await provider.lookupClientByDocument(document);
        if (!found) return { client: null, source: "not_found" };

        // Corrida: duas buscas quase simultâneas pelo mesmo documento ainda
        // não importado podem tentar inserir a mesma linha — a segunda perde
        // a corrida no índice único (tenant_id, cpf_cnpj) e reaproveita o que
        // a primeira acabou de criar, em vez de falhar pro vendedor.
        let row;
        try {
            row = await insertClientRow(client, { ...found.data, lastSellerId: user.id });
        } catch (error) {
            if ((error as { code?: string }).code !== "23505") throw error;
            row = await findClientRowByDocumentDigits(client, digits);
            if (!row) throw error;
        }

        await upsertExternalReferenceRow(client, {
            integrationId: integration.id, entityType: "client", internalId: row.id, externalId: found.externalId,
        });
        await recordAuditEvent(client, {
            action: CLIENT_AUDIT_ACTIONS.CREATED,
            entityId: row.id, actor: user, context,
            metadata: { source: "erp", provider: integration.provider },
        });
        return { client: toClient(row), source: "erp" };
    });
}
