import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Client } from "@/lib/types";
import {
    CreateClientInputSchema,
    UpdateClientInputSchema,
    type ClientLookupResult,
    type ClientSyncResult,
    type ClientsPage,
} from "@/contracts/clients";
import { CpfCnpjSchema, documentDigits } from "@/contracts/shared";
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
import { findExternalIdByInternalId, upsertExternalReferenceRow } from "@/models/erpExternalReferencesModel";
import { createErpProvider } from "@/erp/registry";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { recordAuditEvent, CLIENT_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { toClient } from "./clientMapper";

const ERP_SYNCABLE_FIELDS = [
    "cpfCnpj", "email", "cep", "street", "number",
    "complement", "neighborhood", "city", "state",
] as const satisfies readonly (keyof Client)[];

const AUDITED_CLIENT_FIELDS = [
    "name", "cpfCnpj", "email", "cep", "street", "number", "complement",
    "neighborhood", "city", "state", "companyResponsible", "storeName",
] as const;

function canManageClients(user: AuthUser): boolean {
    return user.role !== "cliente";
}

export async function searchTenantClients(tenant: Tenant, user: AuthUser, query?: string): Promise<Client[]> {
    if (!canManageClients(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) =>
        (await searchClientRows(client, query?.trim() || null)).map(toClient),
    );
}

export type AdministrativeClientsPage = ClientsPage;

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
    value: unknown,
    context: AuditRequestContext,
): Promise<Client> {
    if (!canManageClients(user)) throw new ForbiddenError();
    const parsed = CreateClientInputSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    const { name, cpfCnpj } = parsed.data;
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
    value: unknown,
    context: AuditRequestContext,
): Promise<Client | null> {
    if (!canManageClients(user) && user.clientId !== id) throw new ForbiddenError();
    const parsed = UpdateClientInputSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    return withTenantTransaction(tenant, user, async (client) => {
        const currentRow = await findClientRow(client, id);
        if (!currentRow) return null;
        const current = toClient(currentRow);
        const merged = { ...current, ...parsed.data };
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
        const changedFields = AUDITED_CLIENT_FIELDS.filter((field) => Object.hasOwn(parsed.data, field));
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
    const parsedDocument = CpfCnpjSchema.safeParse(document);
    if (!parsedDocument.success) {
        throw new ValidationError("INVALID_DOCUMENT", "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.", parsedDocument.error.issues);
    }
    const digits = parsedDocument.data;

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

        // provider.lookupClientByDocument já casou este registro pelo
        // documento buscado (é o próprio filtro da busca), mas o mapper do
        // provider pode não ecoar o campo de volta (ex.: TOTVS às vezes não
        // devolve "cpf"/"cnpj" no corpo de individuals/legal-entities search).
        // Sem isso o cliente importa sem documento e nunca mais casa no
        // /login por CPF (findClientRowByDocumentDigits não acha cpf_cnpj
        // nulo) — usamos os dígitos já validados como garantia, já que são
        // exatamente o que este cliente comprovadamente tem.
        const dataToInsert = { ...found.data, cpfCnpj: found.data.cpfCnpj || digits, lastSellerId: user.id };

        // Corrida: duas buscas quase simultâneas pelo mesmo documento ainda
        // não importado podem tentar inserir a mesma linha — a segunda perde
        // a corrida no índice único (tenant_id, cpf_cnpj) e reaproveita o que
        // a primeira acabou de criar, em vez de falhar pro vendedor.
        let row;
        try {
            row = await insertClientRow(client, dataToInsert);
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

// Botão "sincronizar com ERP" da página de detalhe do cliente: busca esse
// registro de novo no ERP e preenche só os campos que ainda estão vazios
// localmente — nunca sobrescreve o que já foi preenchido (na loja ou pela
// própria cliente). Cliente sem cpfCnpj salvo (o caso que este botão existe
// pra consertar) não tem documento pra buscar de novo; usa o external_id
// gravado na importação original, que para individuals/legal-entities do
// TOTVS é o próprio documento (ver totvsmoda/index.ts:lookupClientByDocument).
export async function syncClientFromErp(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    context: AuditRequestContext,
): Promise<ClientSyncResult> {
    if (!canManageClients(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const currentRow = await findClientRow(client, id);
        if (!currentRow) throw new NotFoundError("CLIENT_NOT_FOUND");
        const current = toClient(currentRow);

        const integration = await findActiveErpIntegrationRow(client);
        if (!integration) throw new ValidationError("ERP_INTEGRATION_NOT_CONFIGURED");
        const provider = createErpProvider(
            integration.provider, integration.credentials,
            createExternalApiCallReporter(tenant, user, integration.provider),
        );
        if (!provider.lookupClientByDocument) throw new ValidationError("ERP_SYNC_UNAVAILABLE");

        const rawDocument = current.cpfCnpj
            || await findExternalIdByInternalId(client, integration.id, "client", id);
        const parsedDocument = rawDocument ? CpfCnpjSchema.safeParse(rawDocument) : null;
        if (!parsedDocument?.success) throw new ValidationError("CLIENT_WITHOUT_DOCUMENT");

        const found = await provider.lookupClientByDocument(parsedDocument.data);
        if (!found) throw new NotFoundError("ERP_CLIENT_NOT_FOUND");

        const fresh = { ...found.data, cpfCnpj: found.data.cpfCnpj || parsedDocument.data };
        const updatedFields = ERP_SYNCABLE_FIELDS.filter((field) => !current[field]?.trim() && Boolean(fresh[field]?.trim()));
        if (updatedFields.length === 0) return { client: current, updatedFields: [] };

        const merged = { ...current, ...Object.fromEntries(updatedFields.map((field) => [field, fresh[field]])) };
        const row = await updateClientRow(client, id, { ...merged, name: merged.name.trim() });
        if (!row) throw new NotFoundError("CLIENT_NOT_FOUND");

        await upsertExternalReferenceRow(client, {
            integrationId: integration.id, entityType: "client", internalId: id, externalId: found.externalId,
        });
        await recordAuditEvent(client, {
            action: CLIENT_AUDIT_ACTIONS.UPDATED,
            entityId: id, actor: user, context,
            metadata: { changedFields: updatedFields, source: "erp_resync" },
        });
        return { client: toClient(row), updatedFields };
    });
}
