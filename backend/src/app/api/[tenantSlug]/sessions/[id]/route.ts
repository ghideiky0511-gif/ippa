import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as orders from "@/services/orders";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Resync de uma sessão só — usado pelo realtime incremental do talão quando
// a cadeia causal de um evento de itens tem buraco (ver
// frontend/src/lib/realtime/applySessionEvent.ts), em vez de refazer o GET
// /sessions inteiro.
export async function GET(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(() =>
        orders.orderSessionById(route.tenant, authenticated.user, route.params.id),
    );
}

export async function PUT(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const body = (await request.json().catch(() => null)) as Record<
        string,
        unknown
    > | null;
    if (!body)
        return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    return execute(() =>
        orders.updateSession(
            route.tenant,
            authenticated.user,
            route.params.id,
            body,
        ),
    );
}
