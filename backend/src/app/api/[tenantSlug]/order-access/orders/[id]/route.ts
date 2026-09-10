import { NextRequest } from "next/server";
import { execute } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import { orderAccessSessionCookieName } from "@/services/orders/orderAccessService";
import * as orders from "@/services/orders";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function GET(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const { id } = await context.params;
    const orderNumber = Number(id);
    if (!Number.isSafeInteger(orderNumber) || orderNumber < 1) {
        return new Response(JSON.stringify({ error: "Pedido inválido." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }
    return execute(() =>
        orders.orderByAccessSession(
            route.tenant,
            orderNumber,
            request.cookies.get(orderAccessSessionCookieName(route.tenant.slug))
                ?.value,
        ),
    );
}
