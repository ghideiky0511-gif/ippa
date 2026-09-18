import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import {
    execute,
    rateLimit,
    requestToken,
    sessionRateLimitKey,
    SESSION_POLL_RATE_LIMIT,
    tooManyRequests,
} from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import { mintUpdatesRealtimeTicket } from "@/services/realtime/ticketService";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const token = requestToken(request, route.tenant.slug);
    // Antes de autenticar: um cliente reconectando em loop pede um ticket novo
    // por tentativa, e cada getAuthenticatedSession abaixo gasta conexão do
    // pool -- o recurso que a rajada esgota.
    const limitResult = rateLimit(
        "realtime-ticket",
        sessionRateLimitKey(token),
        SESSION_POLL_RATE_LIMIT.limit,
        SESSION_POLL_RATE_LIMIT.windowMs,
    );
    if (!limitResult.allowed) return tooManyRequests(limitResult.retryAfterSeconds);
    const authenticated = await authentication.getAuthenticatedSession(route.tenant, token);
    if (!authenticated)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(async () =>
        mintUpdatesRealtimeTicket(route.tenant, authenticated.user),
    );
}
