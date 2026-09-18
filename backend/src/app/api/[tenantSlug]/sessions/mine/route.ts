import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import {
    auditContext,
    execute,
    rateLimit,
    requestToken,
    sessionRateLimitKey,
    SESSION_POLL_RATE_LIMIT,
    tooManyRequests,
} from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as orders from "@/services/orders";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

export async function GET(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const token = requestToken(request, route.tenant.slug);
    // Antes de autenticar: getAuthenticatedSession abre transação e gasta
    // conexão do pool, que é exatamente o recurso que a rajada esgota.
    const limitResult = rateLimit(
        "sessions-mine",
        sessionRateLimitKey(token),
        SESSION_POLL_RATE_LIMIT.limit,
        SESSION_POLL_RATE_LIMIT.windowMs,
    );
    if (!limitResult.allowed) return tooManyRequests(limitResult.retryAfterSeconds);
    const session = await authentication.getAuthenticatedSession(route.tenant, token);
    if (!session)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(() => orders.customerActiveSession(route.tenant, session.user));
}

export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;
    const contextData = auditContext(request);
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const mutationContext = {
        ...contextData,
        sessionId: authenticated.sessionId,
    };
    return execute(() =>
        orders.ensureCustomerOrderSession(
            route.tenant,
            authenticated.user,
            body,
            mutationContext,
        ),
    );
}
