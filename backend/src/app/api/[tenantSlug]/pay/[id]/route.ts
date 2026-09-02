import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute } from "@/lib/http/apiHelpers";
import * as orders from "@/services/orders";
import { ValidationError } from "@/services/shared/errors";
import type { PaymentMethod } from "@/payments/types";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// /pagar/[token] atende dois tipos de token na mesma URL pública (ver
// orderPaymentLinkService.ts): um token de PEDIDO (cobrança real via
// Stripe, já separado) tem prioridade; se não achar, cai pro token de
// SESSÃO mais antigo (paymentService.ts, só finaliza o checkout, nunca
// cobrou de verdade). Mantém os dois fluxos existentes intactos.
export async function GET(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    return execute(async () => {
        const orderSummary = await orders.findOrderPaymentSummary(route.tenant, route.params.id);
        if (orderSummary) return { kind: "charge" as const, ...orderSummary };
        const summary = await orders.paymentSummary(route.tenant, route.params.id);
        return { kind: "checkout" as const, ...summary };
    });
}

export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return execute(async () => {
        const orderSummary = await orders.findOrderPaymentSummary(route.tenant, route.params.id);
        if (orderSummary) {
            // "cartao" preserva o comportamento de clientes antigos que só
            // mandavam cardToken sem method (a rota só aceitava cartão até
            // aqui) -- default explícito em vez de exigir o campo.
            const method = typeof body.method === "string" ? body.method : "cartao";
            const cardToken = typeof body.cardToken === "string" ? body.cardToken.trim() : undefined;
            if (method === "cartao" && !cardToken) {
                throw new ValidationError("INVALID_INPUT", "cardToken é obrigatório.");
            }
            const result = await orders.chargeOrderPayment(route.tenant, route.params.id, {
                method: method as PaymentMethod,
                cardToken,
                installments: typeof body.installments === "number" ? body.installments : undefined,
                paymentMethodId: typeof body.paymentMethodId === "string" ? body.paymentMethodId : undefined,
                issuerId: typeof body.issuerId === "string" ? body.issuerId : undefined,
            });
            return { kind: "charge" as const, result };
        }
        return orders.confirmPayment(route.tenant, route.params.id);
    });
}
