import { NextRequest, NextResponse } from "next/server";
import { execute, rateLimit, requestToken, tooManyRequests } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import * as authentication from "@/services/auth";
import * as orders from "@/services/orders";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session) return NextResponse.json({ error: "N\u00e3o autenticado." }, { status: 401 });
    const limit = rateLimit(
        "manual-order-whatsapp",
        `${route.tenant.id}:${session.user.id}`,
        10,
        60_000,
    );
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = await request.json().catch(() => null);
    return execute(() => orders.sendOrderWhatsApp(route.tenant, session.user, route.params.id, body));
}
