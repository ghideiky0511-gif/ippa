import { createHash, randomBytes } from "node:crypto";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, CartItem, Order, OrderFreight } from "@/lib/types";
import {
    findOrderFreightRowByOrderId,
} from "@/models/orderFreightsModel";
import {
    findOrderRowById,
    findOrderRowByPaymentTokenHash,
    listOrderItemRowsByOrder,
    setOrderPaymentTokenRow,
} from "@/models/ordersModel";
import { findClientRow } from "@/models/clientsModel";
import { findActivePaymentIntegrationRow } from "@/models/paymentIntegrationsModel";
import { findStoreSettingsRow } from "@/models/settingsModel";
import { PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES } from "@/services/settings";
import { createOrderCharge, toOrderPaymentCharge } from "@/services/payments/paymentChargeService";
import { getStripePublishableKey } from "@/payments/providers/stripe/client";
import type { ChargeResult, PaymentMethod } from "@/payments/types";
import { listPaymentChargeRowsByOrder } from "@/models/paymentChargesModel";
import type { OrderPaymentCharge } from "@/contracts/payments";
import { ForbiddenError, GoneError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { toOrderFreight } from "./orderMapper";

// Token de COBRANÇA de um pedido já separado -- não confundir com
// paymentService.ts (mesmo diretório), que resolve o token de order_sessions
// pra FINALIZAR um checkout ainda pendente (fluxo mais antigo, deixado
// intacto). Os dois convivem na mesma página pública /pagar/[token] (ver
// backend/src/app/api/[tenantSlug]/pay/[id]/route.ts): o token de pedido é
// tentado primeiro; só cai pro fluxo de sessão se não achar nada.

function digest(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

async function expirationMinutes(client: Parameters<typeof findStoreSettingsRow>[0]): Promise<number> {
    const settings = await findStoreSettingsRow(client);
    return settings?.payment_link_expiration_minutes ?? PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES;
}

function expired(createdAt: Date | null, minutes: number): boolean {
    return Boolean(createdAt && Date.now() - createdAt.getTime() > minutes * 60_000);
}

// Só a própria cliente do pedido, ou alguém da loja, pode gerar o link de
// cobrança -- mesma checagem de dono usada em orderService.visibleOrder.
function canRequestPaymentLink(actor: AuthUser, orderClientId: string | null): boolean {
    if (actor.role !== "cliente") return true;
    return Boolean(actor.clientId && orderClientId === actor.clientId);
}

export async function createOrderPaymentLink(
    tenant: Tenant,
    actor: AuthUser,
    orderId: string,
): Promise<{ token: string }> {
    const token = randomBytes(24).toString("hex");
    await withTenantTransaction(tenant, actor, async (client) => {
        const order = await findOrderRowById(client, orderId);
        if (!order) throw new NotFoundError("ORDER_NOT_FOUND");
        if (!canRequestPaymentLink(actor, order.client_id)) throw new ForbiddenError();
        if (order.status !== "separado") throw new ValidationError("ORDER_NOT_READY_FOR_PAYMENT");
        if (order.payment_status === "paid") throw new ValidationError("ORDER_ALREADY_PAID");
        if (!order.client_id) throw new ValidationError("CLIENT_REQUIRED");
        const registration = await findClientRow(client, order.client_id);
        if (!registration || !registration.name.trim() || !registration.cpf_cnpj?.trim() || !registration.email?.trim()) {
            throw new ValidationError("INCOMPLETE_CLIENT");
        }
        const updated = await setOrderPaymentTokenRow(client, orderId, digest(token));
        if (!updated) throw new NotFoundError("ORDER_NOT_FOUND");
    });
    return { token };
}

export interface OrderPaymentSummary {
    orderId: string;
    orderNumber: number;
    clientName: string;
    items: CartItem[];
    total: number;
    discount?: Order["discount"];
    freight?: OrderFreight;
    paymentStatus: NonNullable<Order["paymentStatus"]>;
    // null = nenhum gateway ativo pra este tenant (onboarding nunca
    // concluído) -- o front mostra "pagamento indisponível". O shape de
    // publicCredentials varia por provider (ver findOrderPaymentSummary):
    // stripe -> { publishableKey, stripeAccountId } (PaymentMethods
    // precisam nascer já no contexto da connected account, loadStripe(pk,
    // { stripeAccount }), senão a Stripe recusa com "resource_missing" numa
    // direct charge); mercadopago -> { publicKey, userId } (inicializa os
    // Bricks).
    provider: string | null;
    publicCredentials: Record<string, unknown>;
}

/** null = token não é (ou não é mais) um token de pedido válido -- quem
 * chama cai pro fluxo de sessão existente (ver rota pay/[id]). */
export async function findOrderPaymentSummary(tenant: Tenant, token: string): Promise<OrderPaymentSummary | null> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const order = await findOrderRowByPaymentTokenHash(client, digest(token));
        if (!order) return null;
        if (order.status === "cancelado") throw new NotFoundError("INVALID_PAYMENT_LINK");
        if (expired(order.payment_token_created_at, await expirationMinutes(client))) {
            throw new GoneError("PAYMENT_LINK_EXPIRED");
        }
        const items = (await listOrderItemRowsByOrder(client, order.id)).map((item) => item.snapshot);
        const freightRow = await findOrderFreightRowByOrderId(client, order.id);
        // A linha ATIVA, não "a linha da Stripe" -- é o gateway ativo que
        // de fato vai processar a cobrança (regra "um gateway por vez", ver
        // migration 044). null = nenhum gateway ativo ainda.
        const integrationRow = await findActivePaymentIntegrationRow(client);
        const publicCredentials: Record<string, unknown> =
            integrationRow?.provider === "stripe"
                ? { publishableKey: getStripePublishableKey() ?? null, stripeAccountId: integrationRow.stripe_account_id }
                : integrationRow?.provider === "mercadopago"
                    ? { publicKey: integrationRow.mercadopago_public_key, userId: integrationRow.mercadopago_user_id }
                    : {};
        return {
            orderId: order.id,
            orderNumber: order.order_number,
            clientName: order.client_name ?? "",
            items,
            total: Number(order.total),
            discount: order.discount ?? undefined,
            freight: freightRow ? toOrderFreight(freightRow) : undefined,
            paymentStatus: order.payment_status,
            provider: integrationRow?.provider ?? null,
            publicCredentials,
        };
    });
}

export async function chargeOrderPayment(
    tenant: Tenant,
    token: string,
    input: { method: PaymentMethod; cardToken?: string; installments?: number; paymentMethodId?: string; issuerId?: string },
): Promise<ChargeResult> {
    const prepared = await withTenantTransaction(tenant, {}, async (client) => {
        const order = await findOrderRowByPaymentTokenHash(client, digest(token), true);
        if (!order) throw new NotFoundError("INVALID_PAYMENT_LINK");
        if (expired(order.payment_token_created_at, await expirationMinutes(client))) {
            throw new GoneError("PAYMENT_LINK_EXPIRED");
        }
        if (order.payment_status === "paid") throw new ValidationError("ORDER_ALREADY_PAID");
        if (order.status !== "separado") throw new ValidationError("ORDER_NOT_READY_FOR_PAYMENT");
        if (!order.client_id) throw new ValidationError("CLIENT_REQUIRED");
        // Nome/CPF/e-mail vêm do cadastro do cliente já vinculado ao pedido,
        // nunca do corpo da requisição -- o token prova "este é o pedido
        // certo", não "esta é a identidade certa" (rota pública, sem login).
        const registration = await findClientRow(client, order.client_id);
        if (!registration || !registration.name.trim() || !registration.cpf_cnpj?.trim() || !registration.email?.trim()) {
            throw new ValidationError("INCOMPLETE_CLIENT");
        }
        return {
            orderId: order.id,
            customer: { name: registration.name, document: registration.cpf_cnpj, email: registration.email },
        };
    });
    // createOrderCharge abre suas próprias transações e chama o provider --
    // fica fora da transação acima de propósito, mesmo raciocínio de nunca
    // segurar conexão do pool durante uma chamada de rede.
    return createOrderCharge(tenant, {}, prepared.orderId, {
        method: input.method,
        customer: prepared.customer,
        cardToken: input.cardToken,
        installments: input.installments,
        paymentMethodId: input.paymentMethodId,
        issuerId: input.issuerId,
    });
}

// Histórico de cobrança de um pedido -- mesma checagem de dono de
// createOrderPaymentLink acima (canRequestPaymentLink), reusada aqui porque
// esta é a MESMA regra "só a própria cliente do pedido, ou alguém da loja"
// que se aplica a ver os dados da cobrança, não só a gerar o link. É o que
// permite uma rota HTTP só (orders/[id]/payment) atender tanto o workspace
// quanto a tela /pedidos/[orderNumber] da cliente.
export async function listOrderPaymentCharges(
    tenant: Tenant,
    actor: AuthUser,
    orderId: string,
): Promise<OrderPaymentCharge[]> {
    return withTenantTransaction(tenant, actor, async (client) => {
        const order = await findOrderRowById(client, orderId);
        if (!order) throw new NotFoundError("ORDER_NOT_FOUND");
        if (!canRequestPaymentLink(actor, order.client_id)) throw new ForbiddenError();
        const rows = await listPaymentChargeRowsByOrder(client, orderId);
        return rows.map(toOrderPaymentCharge);
    });
}
