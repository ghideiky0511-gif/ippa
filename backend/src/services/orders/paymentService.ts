import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, CartItem, Discount, Order, OrderSession, SessionFreight } from "@/lib/types";
import {
  closeOpenOrderSessionRowsByOrder,
  findOrderRowById,
  findOrderSessionRowByPaymentTokenHash,
  listOrderItemRowsByOrder,
  updateOrderRow,
} from "@/models/ordersModel";
import { insertOrderFreightRow, type OrderFreightRow } from "@/models/orderFreightsModel";
import { getOrCreateOpenOrder } from "./orderItemSync";
import {
  findStoreSettingsRow,
  listDiscountProductRows,
  listDiscountRows,
  listDiscountTierRows,
} from "@/models/settingsModel";
import { findUserRowByClientId, findUserRowById } from "@/models/usersModel";
import { notifyOrder, notifyOrderBook, notifySession } from "@/services/realtime/updateBroadcast";
import { notifyNewOrderForSeller, notifyOrderConfirmed } from "@/services/notifications";
import { enqueueOrderPush } from "@/services/erp/orderPushService";
import { GoneError, NotFoundError } from "@/services/shared/errors";
import { getCartDiscount } from "@/services/settings";
import { PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES } from "@/services/settings";
import { sessionFreightFromRow, toOrder, toOrderBook, toOrderSession } from "./orderMapper";
import { closeOrderBookWhenFinished } from "./orderBookLifecycle";
import type { OrderBookRow } from "@/models/orderBooksModel";
import { assertOrderItemsInStock } from "./stockGate";

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
  let session = await findOrderSessionRowByPaymentTokenHash(client, digest(token));
  if (!session || session.status !== "aguardando_pagamento") throw new NotFoundError("INVALID_PAYMENT_LINK");
  const settings = await findStoreSettingsRow(client);
  const expiration = settings?.payment_link_expiration_minutes ?? PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES;
  if (expired(session.payment_token_created_at, expiration)) throw new GoneError("PAYMENT_LINK_EXPIRED");
  // Self-healing igual finalizeOrderSession: só falta order_id se a sessão
  // nunca teve como anexar pedido (sem cliente vinculado) -- nesse caso
  // não há como cobrar mesmo, o link não deveria ter sido gerado.
  const orderId = session.order_id ?? (await getOrCreateOpenOrder(client, {
    clientId: session.client_id ?? undefined, sellerId: session.seller_id,
    clientName: session.client_name, channel: session.channel,
  }))?.id;
  if (!orderId) throw new NotFoundError("INVALID_PAYMENT_LINK");
  if (lock) {
    const order = await findOrderRowById(client, orderId, true);
    if (!order || (order.status !== "aberto" && order.status !== "aguardando_pagamento")) {
      throw new NotFoundError("INVALID_PAYMENT_LINK");
    }
    // O lock do pedido vem antes do lock da sessão em todos os caminhos que
    // fecham/alteram carrinho, evitando ciclo com uma sessão irmã de upsell.
    const lockedSession = await findOrderSessionRowByPaymentTokenHash(client, digest(token), true);
    if (!lockedSession || lockedSession.status !== "aguardando_pagamento" || lockedSession.order_id !== orderId) {
      throw new NotFoundError("INVALID_PAYMENT_LINK");
    }
    session = lockedSession;
  }
  const items = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = getCartDiscount(items, await discounts(client));
  const cartTotal = subtotal - discount.totalAmount;
  return { session, orderId, items, subtotal, discount, cartTotal };
}

export interface PaymentSummary {
  clientName: string;
  items: CartItem[];
  cartSubtotal: number;
  cartDiscountLabel: string | null;
  cartDiscountTotal: number;
  cartTotal: number;
  freight?: SessionFreight;
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
      freight: sessionFreightFromRow(context.session),
      total: context.cartTotal + Number(context.session.freight_price ?? 0),
    };
  });
}

export async function confirmPayment(
  tenant: Tenant,
  token: string,
): Promise<{ ok: true; order: Order }> {
  let changedSessions: OrderSession[] = [];
  let changedBooks: OrderBookRow[] = [];
  let recipient: Pick<AuthUser, "id" | "role" | "email" | "name"> | undefined;
  let sellerRecipient: Pick<AuthUser, "id" | "role"> | undefined;
  const order = await withTenantTransaction(tenant, {}, async (client) => {
    const context = await paymentContext(client, token, true);
    // Gate obrigatório: reconfirma que o estoque ainda cobre o pedido no
    // instante exato em que ele deixa de ser editável (ver stockGate).
    await assertOrderItemsInStock(tenant, client, context.items);
    const freightPrice = Number(context.session.freight_price ?? 0);
    const total = context.cartTotal + freightPrice;
    // Sem motor de pagamentos de verdade, este link só confirma o pedido
    // (fecha o carrinho pra separação) -- não paga mais (ver migration 036).
    const row = await updateOrderRow(client, context.orderId, {
      status: "novo",
      total,
      discount: context.discount.totalAmount > 0
        ? { label: context.discount.label!, amount: context.discount.totalAmount }
        : undefined,
    });
    if (!row) throw new NotFoundError("ORDER_NOT_FOUND");
    // Mesmo snapshot que finalizeOrderSession grava em order_freights --
    // este link é a outra forma de fechar uma sessão (fluxo público sem
    // vendedora presente).
    let freightRow: OrderFreightRow | undefined;
    if (context.session.freight_kind) {
      freightRow = await insertOrderFreightRow(client, {
        orderId: context.orderId,
        providerId: context.session.freight_provider_id,
        quoteId: context.session.freight_quote_id,
        kind: context.session.freight_kind,
        label: context.session.freight_label!,
        price: freightPrice,
        etaLabel: context.session.freight_eta_label,
        deliveryTypeId: context.session.delivery_type_id,
        deliveryOfferingId: context.session.delivery_offering_id,
        deliveryProviderId: context.session.delivery_provider_id,
        fulfillmentMode: context.session.delivery_fulfillment_mode,
        deliveryTypeName: context.session.delivery_type_name,
        deliveryProviderName: context.session.delivery_provider_name,
        destinationCep: context.session.delivery_destination_cep,
      });
    }
    const seller = await findUserRowById(client, context.session.seller_id);
    if (seller) sellerRecipient = { id: seller.id, role: seller.role };
    // Fecha toda sessão irmã ainda aberta apontando pro mesmo pedido
    // (upsell entre talões) -- ver mesmo ajuste em finalizeOrderSession.
    const closedRows = await closeOpenOrderSessionRowsByOrder(client, context.orderId);
    changedSessions = closedRows.map((closedRow) => toOrderSession(closedRow, context.items));
    const bookIds = new Set(closedRows.map((closedRow) => closedRow.order_book_id));
    changedBooks = (await Promise.all(
      [...bookIds].map((bookId) => closeOrderBookWhenFinished(client, bookId)),
    )).filter((book): book is OrderBookRow => Boolean(book));
    if (context.session.client_id) {
      const user = await findUserRowByClientId(client, context.session.client_id);
      if (user) recipient = { id: user.id, role: user.role, email: user.email, name: user.name };
    }
    return toOrder(row, context.items, freightRow);
  });
  for (const changedSession of changedSessions) notifySession(tenant.id, changedSession);
  for (const book of changedBooks) notifyOrderBook(tenant.id, toOrderBook(book));
  notifyOrder(tenant.id, order);
  if (recipient) notifyOrderConfirmed(tenant, recipient, order);
  if (sellerRecipient) notifyNewOrderForSeller(tenant, sellerRecipient, order);
  await enqueueOrderPush(tenant, {}, order.id);
  return { ok: true, order };
}
