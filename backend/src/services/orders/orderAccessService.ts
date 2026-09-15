import { createHash, randomBytes } from "node:crypto";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { Order } from "@/lib/types";
import {
    consumeOrderAccessToken,
    findOrderAccessTokenByHash,
    findOrderAccessTokenBySessionHash,
    insertOrderAccessToken,
    revokeOrderAccessTokenByHash,
    revokeOtherOrderAccessTokens,
} from "@/models/orderAccessTokensModel";
import { findOrderFreightRowByOrderId } from "@/models/orderFreightsModel";
import { findOrderRowById, findOrderRowByNumber, listOrderItemRowsByOrder } from "@/models/ordersModel";
import { GoneError, NotFoundError } from "@/services/shared/errors";
import { toOrder } from "./orderMapper";

const ORDER_ACCESS_TOKEN_TTL_MS = 15 * 60 * 1_000;
export const ORDER_ACCESS_SESSION_TTL_SECONDS = 30 * 60;

function digest(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

function opaqueToken(): string {
    return randomBytes(32).toString("base64url");
}

export function orderAccessSessionCookieName(tenantSlug: string): string {
    return `ippa_order_access_${tenantSlug.replace(/[^a-z0-9-]/g, "")}`;
}

export async function createOrderAccessToken(
    tenant: Tenant,
    orderId: string,
): Promise<{ token: string; expiresAt: Date }> {
    const token = opaqueToken();
    const expiresAt = new Date(Date.now() + ORDER_ACCESS_TOKEN_TTL_MS);
    await withTenantTransaction(tenant, {}, async (client) => {
        const order = await findOrderRowById(client, orderId, true);
        if (!order || order.status === "cancelado") {
            throw new NotFoundError("ORDER_ACCESS_UNAVAILABLE", "Pedido indisponível para acesso por link.");
        }
        await insertOrderAccessToken(client, {
            orderId: order.id,
            tokenHash: digest(token),
            expiresAt,
        });
    });
    return { token, expiresAt };
}

export async function exchangeOrderAccessToken(
    tenant: Tenant,
    token: string,
): Promise<{ orderNumber: number; sessionToken: string }> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
        throw new NotFoundError("ORDER_ACCESS_LINK_INVALID", "Este link de acesso é inválido ou expirou.");
    }
    const sessionToken = opaqueToken();
    const sessionExpiresAt = new Date(
        Date.now() + ORDER_ACCESS_SESSION_TTL_SECONDS * 1_000,
    );
    return withTenantTransaction(tenant, {}, async (client) => {
        const access = await findOrderAccessTokenByHash(
            client,
            digest(normalizedToken),
            true,
        );
        if (
            !access ||
            access.consumed_at ||
            access.revoked_at ||
            access.expires_at <= new Date()
        ) {
            throw new GoneError("ORDER_ACCESS_LINK_EXPIRED", "Este link de acesso expirou ou já foi usado.");
        }
        const order = await findOrderRowById(client, access.order_id, true);
        if (!order || order.status === "cancelado") {
            throw new NotFoundError("ORDER_ACCESS_UNAVAILABLE", "Pedido indisponível para acesso por link.");
        }
        await consumeOrderAccessToken(client, access.id, {
            sessionHash: digest(sessionToken),
            sessionExpiresAt,
        });
        return { orderNumber: order.order_number, sessionToken };
    });
}

export async function discardOrderAccessToken(
    tenant: Tenant,
    token: string,
): Promise<void> {
    await withTenantTransaction(tenant, {}, (client) =>
        revokeOrderAccessTokenByHash(client, digest(token)),
    );
}

export async function revokePreviousOrderAccessTokens(
    tenant: Tenant,
    orderId: string,
    currentToken: string,
): Promise<void> {
    await withTenantTransaction(tenant, {}, (client) =>
        revokeOtherOrderAccessTokens(client, orderId, digest(currentToken)),
    );
}

export async function orderByAccessSession(
    tenant: Tenant,
    orderNumber: number,
    sessionToken: string | undefined,
): Promise<Order> {
    if (!sessionToken) throw new NotFoundError("ORDER_ACCESS_SESSION_INVALID", "Acesso ao pedido não encontrado.");
    return withTenantTransaction(tenant, {}, async (client) => {
        const access = await findOrderAccessTokenBySessionHash(
            client,
            digest(sessionToken),
        );
        if (!access) throw new GoneError("ORDER_ACCESS_SESSION_EXPIRED", "Seu acesso temporário expirou.");
        const order = await findOrderRowByNumber(client, orderNumber);
        if (!order || order.id !== access.order_id || order.status === "cancelado") {
            throw new NotFoundError("ORDER_ACCESS_UNAVAILABLE", "Pedido indisponível para acesso por link.");
        }
        const items = (await listOrderItemRowsByOrder(client, order.id)).map(
            (item) => item.snapshot,
        );
        const freight = await findOrderFreightRowByOrderId(client, order.id);
        return toOrder(order, items, freight);
    });
}
