import { NextRequest, NextResponse } from "next/server";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import * as authentication from "@/services/auth";
import * as crm from "@/services/crm";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Mensagens de UMA conversa, em ordem cronológica -- só acessível se `id`
// já tiver sido visto por GET /crm/conversations nesta organização (ver
// crmConversationService.requireKnownConversationScope) e pertencer ao
// escopo do usuário.
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const params = request.nextUrl.searchParams;
    const direction = params.get("direction");
    const limitParam = params.get("limit");
    return execute(() =>
        crm.listCrmMessages(route.tenant, session.user, route.params.id, {
            direction: direction === "inbound" || direction === "outbound" ? direction : undefined,
            cursor: params.get("cursor") ?? undefined,
            limit: limitParam ? Number(limitParam) : undefined,
        }),
    );
}
