import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as orders from "@/services/orders";

type RouteContext = { params: Promise<{ tenantSlug: string; orderNumber: string }> };

export const dynamic = "force-dynamic";

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
    if (!session) return NextResponse.json({ error: "NÃ£o autenticado." }, { status: 401 });

    const { orderNumber: rawOrderNumber } = await context.params;
    if (!/^[1-9]\d*$/.test(rawOrderNumber)) {
        return NextResponse.json({ error: "NÃºmero de pedido invÃ¡lido." }, { status: 400 });
    }
    const orderNumber = Number(rawOrderNumber);
    if (!Number.isSafeInteger(orderNumber)) {
        return NextResponse.json({ error: "NÃºmero de pedido invÃ¡lido." }, { status: 400 });
    }
    return execute(() => orders.orderByNumber(route.tenant, session.user, orderNumber));
}
