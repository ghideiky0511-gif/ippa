import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, OrderSession } from "@/lib/types";
import {
    findLatestOpenOrderSessionRowByClient,
    findOrderSessionRow,
    insertOrderSessionItemRow,
    insertOrderSessionRow,
    listOrderSessionItemRowsBySession,
    listOrderSessionItemRows,
    listOrderSessionRowsBySeller,
    replaceOrderSessionItemRows,
    updateOrderSessionRow,
} from "@/models/ordersModel";
import { findClientRow, updateClientRow } from "@/models/clientsModel";
import { findUserRowById } from "@/models/usersModel";
import { recordAuditEvent, ORDER_SESSION_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { notifySession } from "@/lib/sseHub";
import { toOrderSession } from "./orderMapper";

export async function sellerSessions(tenant: Tenant, user: AuthUser): Promise<OrderSession[]> {
    if (user.role !== "vendedora") throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const [sessions, items] = await Promise.all([
            listOrderSessionRowsBySeller(client, user.id),
            listOrderSessionItemRows(client),
        ]);
        return sessions.map((session) => toOrderSession(
            session,
            items.filter((item) => item.session_id === session.id).map((item) => item.snapshot),
        ));
    });
}

export async function customerActiveSession(tenant: Tenant, user: AuthUser): Promise<OrderSession | null> {
    if (user.role !== "cliente" || !user.clientId) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await findLatestOpenOrderSessionRowByClient(client, user.clientId!);
        if (!row) return null;
        const [items, seller] = await Promise.all([
            listOrderSessionItemRowsBySession(client, row.id),
            findUserRowById(client, row.seller_id),
        ]);
        return { ...toOrderSession(row, items.map((item) => item.snapshot)), sellerName: seller?.name };
    });
}

export async function createSellerSession(
    tenant: Tenant,
    user: AuthUser,
    body: Partial<OrderSession>,
    context: AuditRequestContext,
): Promise<OrderSession> {
    if (user.role !== "vendedora") throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const items = Array.isArray(body.items) ? body.items : [];
        const row = await insertOrderSessionRow(client, {
            clientName: typeof body.clientName === "string" && body.clientName.trim()
                ? body.clientName.trim() : "Sem cliente",
            clientId: body.clientId,
            sellerId: user.id,
            channel: body.channel === "whatsapp" || body.channel === "online" ? body.channel : "presencial",
            status: "aberto",
            shipping: undefined,
            notes: body.notes,
        });
        for (const item of items) await insertOrderSessionItemRow(client, row.id, item);
        const created = toOrderSession(row, items);
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

export async function updateSession(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    body: Partial<OrderSession> & { shipping?: unknown },
): Promise<OrderSession> {
    const updated = await withTenantTransaction(tenant, user, async (client) => {
        const currentRow = await findOrderSessionRow(client, id);
        if (!currentRow) throw new NotFoundError("SESSION_NOT_FOUND");
        const currentItems = (await listOrderSessionItemRowsBySession(client, id)).map((item) => item.snapshot);
        const isSeller = user.role === "vendedora" && currentRow.seller_id === user.id;
        const isClient = user.role === "cliente" && Boolean(currentRow.client_id) && currentRow.client_id === user.clientId;
        if (!isSeller && !isClient) throw new ForbiddenError();

        let clientId = currentRow.client_id ?? undefined;
        let clientName = currentRow.client_name;
        let notes = currentRow.notes ?? undefined;
        let status = currentRow.status;
        if (isSeller) {
            if (typeof body.clientId === "string" && body.clientId) {
                const registration = await findClientRow(client, body.clientId);
                if (!registration) throw new NotFoundError("CLIENT_NOT_FOUND");
                clientId = registration.id;
                clientName = registration.name;
                await updateClientRow(client, registration.id, {
                    name: registration.name,
                    cpfCnpj: registration.cpf_cnpj ?? undefined,
                    email: registration.email ?? undefined,
                    cep: registration.cep ?? undefined,
                    street: registration.street ?? undefined,
                    number: registration.number ?? undefined,
                    complement: registration.complement ?? undefined,
                    neighborhood: registration.neighborhood ?? undefined,
                    city: registration.city ?? undefined,
                    state: registration.state ?? undefined,
                    companyResponsible: registration.company_responsible ?? undefined,
                    storeName: registration.store_name ?? undefined,
                    lastSellerId: user.id,
                });
            }
            if (typeof body.notes === "string") notes = body.notes;
            if (body.status !== undefined) {
                if (!(["aberto", "fechado", "aguardando_pagamento"] as unknown[]).includes(body.status)) {
                    throw new ValidationError();
                }
                status = body.status;
            }
        }
        let shipping = currentRow.shipping ?? undefined;
        if (body.shipping === null) shipping = undefined;
        else if (body.shipping && typeof body.shipping === "object" &&
            typeof (body.shipping as { price?: unknown }).price === "number") shipping = body.shipping as OrderSession["shipping"];
        const items = Array.isArray(body.items) ? body.items : currentItems;
        if (Array.isArray(body.items)) await replaceOrderSessionItemRows(client, id, items);
        const row = await updateOrderSessionRow(client, id, {
            clientName, clientId, notes, status, shipping,
            clearPaymentToken: status === "aberto" && currentRow.status !== "aberto",
        });
        if (!row) throw new NotFoundError("SESSION_NOT_FOUND");
        return toOrderSession(row, items);
    });
    notifySession(updated);
    return updated;
}
