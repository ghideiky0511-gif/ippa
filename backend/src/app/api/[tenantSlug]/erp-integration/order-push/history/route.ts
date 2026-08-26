import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as erp from "@/services/erp";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Histórico de tentativas de envio de UM pedido ao ERP (provider_order_attempts,
// ver orderPushService.listOrderPushHistory) -- diferente de order-push/route.ts,
// que só devolve o estado atual (uma linha em provider_orders).
export async function GET(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session)
        return NextResponse.json(
            { error: "Não autenticado." },
            { status: 401 },
        );
    const orderId = request.nextUrl.searchParams.get("orderId") ?? "";
    if (!orderId)
        return NextResponse.json(
            { error: "Informe orderId." },
            { status: 400 },
        );
    return execute(() =>
        erp.listOrderPushHistory(route.tenant, session.user, orderId),
    );
}
