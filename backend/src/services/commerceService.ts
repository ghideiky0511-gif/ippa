import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, CartItem, Client, OrderSession } from "@/lib/types";
import {
    findClient,
    findClientByDocument,
    insertClient,
    replaceClient,
    replaceClientCart,
    searchClients,
} from "@/models/clientsModel";
import {
    insertSession,
    listOrders,
    listSessionsForSeller,
} from "@/models/ordersModel";
import { recordAuditEvent, type AuditRequestContext } from "./auditService";
import {
    CLIENT_AUDIT_ACTIONS,
    CLIENT_CART_AUDIT_ACTIONS,
    ORDER_SESSION_AUDIT_ACTIONS,
} from "./audit/actions";

export class ForbiddenError extends Error {}
export class ConflictError extends Error {}

function canManageClients(user: AuthUser): boolean {
    return user.role === "administrador" || user.role === "vendedora";
}

const AUDITED_CLIENT_FIELDS = [
    "name",
    "cpfCnpj",
    "email",
    "cep",
    "street",
    "number",
    "complement",
    "neighborhood",
    "city",
    "state",
    "companyResponsible",
    "storeName",
] as const;

export async function searchTenantClients(
    tenant: Tenant,
    user: AuthUser,
    query?: string,
): Promise<Client[]> {
    if (!canManageClients(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, (client) =>
        searchClients(client, query),
    );
}

export async function getTenantClient(
    tenant: Tenant,
    user: AuthUser,
    id: string,
): Promise<Client | null> {
    if (!canManageClients(user) && user.clientId !== id)
        throw new ForbiddenError();
    return withTenantTransaction(tenant, user, (client) =>
        findClient(client, id),
    );
}

export async function createTenantClient(
    tenant: Tenant,
    user: AuthUser,
    value: Pick<Client, "name" | "cpfCnpj">,
    context: AuditRequestContext,
): Promise<Client> {
    if (!canManageClients(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        if (
            value.cpfCnpj &&
            (await findClientByDocument(client, value.cpfCnpj))
        )
            throw new ConflictError("DOCUMENT_TAKEN");
        const created = await insertClient(client, {
            name: value.name.trim(),
            cpfCnpj: value.cpfCnpj,
            email: undefined,
            cep: undefined,
            street: undefined,
            number: undefined,
            complement: undefined,
            neighborhood: undefined,
            city: undefined,
            state: undefined,
            companyResponsible: undefined,
            storeName: undefined,
            lastSellerId: user.id,
        });
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
    if (!canManageClients(user) && user.clientId !== id)
        throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        if (value.cpfCnpj) {
            const existing = await findClientByDocument(client, value.cpfCnpj);
            if (existing && existing.id !== id)
                throw new ConflictError("DOCUMENT_TAKEN");
        }
        const updated = await replaceClient(client, id, value);
        if (updated) {
            const changedFields = AUDITED_CLIENT_FIELDS.filter((field) =>
                Object.hasOwn(value, field),
            );
            await recordAuditEvent(client, {
                action: CLIENT_AUDIT_ACTIONS.UPDATED,
                entityId: id,
                actor: user,
                context,
                metadata: { changedFields },
            });
        }
        return updated;
    });
}

export async function saveClientCart(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    items: CartItem[],
    context: AuditRequestContext,
): Promise<void> {
    if (user.clientId !== id) throw new ForbiddenError();
    await withTenantTransaction(tenant, user, async (client) => {
        if (!(await findClient(client, id))) throw new Error("NOT_FOUND");
        await replaceClientCart(client, id, items);
        await recordAuditEvent(client, {
            action: CLIENT_CART_AUDIT_ACTIONS.SAVED,
            entityId: id,
            actor: user,
            context,
            metadata: { itemCount: items.length },
        });
    });
}

export async function sellerSessions(
    tenant: Tenant,
    user: AuthUser,
): Promise<OrderSession[]> {
    if (user.role !== "vendedora") throw new ForbiddenError();
    return withTenantTransaction(tenant, user, (client) =>
        listSessionsForSeller(client, user.id),
    );
}

export async function createSellerSession(
    tenant: Tenant,
    user: AuthUser,
    body: Partial<OrderSession>,
    context: AuditRequestContext,
): Promise<OrderSession> {
    if (user.role !== "vendedora") throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const created = await insertSession(client, {
            clientName:
                typeof body.clientName === "string" && body.clientName.trim()
                    ? body.clientName.trim()
                    : "Sem cliente",
            clientId: body.clientId,
            sellerId: user.id,
            channel:
                body.channel === "whatsapp" || body.channel === "online"
                    ? body.channel
                    : "presencial",
            items: Array.isArray(body.items) ? body.items : [],
            status: "aberto",
            shipping: undefined,
            notes: body.notes,
        });
        await recordAuditEvent(client, {
            action: ORDER_SESSION_AUDIT_ACTIONS.CREATED,
            entityId: created.id,
            actor: user,
            context,
            metadata: {
                channel: created.channel,
                hasClient: Boolean(created.clientId),
                itemCount: created.items.length,
            },
        });
        return created;
    });
}

export async function userOrders(tenant: Tenant, user: AuthUser) {
    if (user.role === "cliente" && user.clientId)
        return withTenantTransaction(tenant, user, (client) =>
            listOrders(client, "client_id", user.clientId!),
        );
    if (user.role === "vendedora")
        return withTenantTransaction(tenant, user, (client) =>
            listOrders(client, "seller_id", user.id),
        );
    throw new ForbiddenError();
}
