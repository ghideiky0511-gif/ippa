import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { CartItem, Discount, Order, OrderSession } from "@/lib/types";
import {
  closeOrderSessionRow,
  findOrderSessionRowByPaymentTokenHash,
  insertOrderItemRow,
  insertOrderRow,
  listOrderSessionItemRowsBySession,
} from "@/models/ordersModel";
import {
  findStoreSettingsRow,
  listDiscountProductRows,
  listDiscountRows,
  listDiscountTierRows,
} from "@/models/settingsModel";
import { findUserRowByClientId } from "@/models/usersModel";
import { notifySession } from "@/lib/sseHub";
import { notifyOrderConfirmed } from "@/services/notifications";
import { GoneError, NotFoundError } from "@/services/shared/errors";
import { getCartDiscount } from "@/services/settings";
import { PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES } from "@/services/settings";
import { toOrder, toOrderSession } from "./orderMapper";

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function discounts(client: PoolClient): Promise<Discount[]> {
  const [rows, tiers, products] = await Promise.all([
    listDiscountRows(client), listDiscountTierRows(client), listDiscountProductRows(client),
  ]);
  return rows.map((row) => ({
    id: row.id, label: row.label, active: row.active, type: row.type, percent: Number(row.percent),
    tiers: tiers.filter((tier) => tier.discount_id === row.id)
      .map((tier) => ({ minQty: tier.min_qty, percent: Number(tier.percent) })),
    productIds: products.filter((product) => product.discount_id === row.id).map((product) => product.product_id),
  }));
}

function expired(createdAt: Date | null, minutes: number): boolean {
  return Boolean(createdAt && Date.now() - createdAt.getTime() > minutes * 60_000);
}

async function paymentContext(client: PoolClient, token: string, lock = false) {
  const session = await findOrderSessionRowByPaymentTokenHash(client, digest(token), lock);
  if (!session || session.status !== "aguardando_pagamento") throw new NotFoundError("INVALID_PAYMENT_LINK");
  const settings = await findStoreSettingsRow(client);
  const expiration = settings?.payment_link_expiration_minutes ?? PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES;
  if (expired(session.payment_token_created_at, expiration)) throw new GoneError("PAYMENT_LINK_EXPIRED");
  const items = (await listOrderSessionItemRowsBySession(client, session.id)).map((item) => item.snapshot)
    .filter((item) => item.qty > 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = getCartDiscount(items, await discounts(client));
  const cartTotal = subtotal - discount.totalAmount;
  return { session, items, subtotal, discount, cartTotal };
}

export interface PaymentSummary {
  clientName: string;
  items: CartItem[];
  cartSubtotal: number;
  cartDiscountLabel: string | null;
  cartDiscountTotal: number;
  cartTotal: number;
  shipping?: OrderSession["shipping"];
  total: number;
}

export async function paymentSummary(tenant: Tenant, token: string): Promise<PaymentSummary> {
  return withTenantTransaction(tenant, {}, async (client) => {
    const context = await paymentContext(client, token);
    return {
      clientName: context.session.client_name,
      items: context.items,
      cartSubtotal: context.subtotal,
      cartDiscountLabel: context.discount.label,
      cartDiscountTotal: context.discount.totalAmount,
      cartTotal: context.cartTotal,
      shipping: context.session.shipping ?? undefined,
      total: context.cartTotal + (context.session.shipping?.price ?? 0),
    };
  });
}

export async function confirmPayment(
  tenant: Tenant,
  token: string,
  paymentMethod?: string,
): Promise<{ ok: true; order: Order }> {
  let changedSession: OrderSession | undefined;
  let recipient: { email: string; name: string } | undefined;
  const order = await withTenantTransaction(tenant, {}, async (client) => {
    const context = await paymentContext(client, token, true);
    const total = context.cartTotal + (context.session.shipping?.price ?? 0);
    const row = await insertOrderRow(client, {
      clientId: context.session.client_id ?? undefined,
      sellerId: context.session.seller_id,
      clientName: context.session.client_name,
      channel: context.session.channel,
      total,
      shipping: context.session.shipping ?? undefined,
      paymentMethod,
      discount: context.discount.totalAmount > 0
        ? { label: context.discount.label!, amount: context.discount.totalAmount }
        : undefined,
    });
    for (const item of context.items) await insertOrderItemRow(client, row.id, item);
    const closed = await closeOrderSessionRow(client, context.session.id);
    if (closed) changedSession = toOrderSession(closed, context.items);
    if (context.session.client_id) {
      const user = await findUserRowByClientId(client, context.session.client_id);
      if (user) recipient = { email: user.email, name: user.name };
    }
    return toOrder(row, context.items);
  });
  if (changedSession) notifySession(changedSession);
  if (recipient) notifyOrderConfirmed(tenant, recipient, order);
  return { ok: true, order };
}
