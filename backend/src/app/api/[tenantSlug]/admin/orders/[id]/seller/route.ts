import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as orders from "@/services/orders";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Reatribui a vendedora responsável pelo pedido `id` -- endpoint estreito
// de propósito, no mesmo molde de .../clients/[id]/seller (ver
// clientService.reassignClientSeller), só troca o vendedor, não o resto do
// pedido.
export async function PATCH(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const contextData = auditContext(request);
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { sellerId?: string } | null;
    if (!body?.sellerId)
        return NextResponse.json({ error: "sellerId é obrigatório." }, { status: 400 });
    const mutationContext = { ...contextData, sessionId: authenticated.sessionId };
    return execute(() =>
        orders.reassignOrderSeller(
            route.tenant,
            authenticated.user,
            route.params.id,
            body.sellerId!,
            mutationContext,
        ),
    );
}
