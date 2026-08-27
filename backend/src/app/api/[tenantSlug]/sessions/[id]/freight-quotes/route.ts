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

// Substitui o MOCK_SHIPPING_OPTIONS do frontend -- gera (e persiste) uma
// cotação por freight_provider ativo do tenant pra esta sessão.
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
    const cep = request.nextUrl.searchParams.get("cep") ?? undefined;
    return execute(() =>
        orders.listFreightQuotes(route.tenant, authenticated.user, route.params.id, cep),
    );
}

// Escolhe uma das cotações geradas pelo GET acima -- único jeito de setar
// frete numa sessão (o PUT /sessions/:id genérico não aceita mais esse campo).
export async function POST(
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
    const body = (await request.json().catch(() => null)) as { quoteId?: unknown } | null;
    if (!body || typeof body.quoteId !== "string")
        return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    return execute(() =>
        orders.selectFreightQuote(route.tenant, authenticated.user, route.params.id, body.quoteId as string),
    );
}
