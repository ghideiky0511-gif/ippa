import { NextRequest, NextResponse } from "next/server";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import * as authentication from "@/services/auth";
import * as crm from "@/services/crm";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Lista a inbox de conversas já filtrada pelo escopo do usuário (ver
// crmAuthorization.resolveVisibleInboxes) e enriquecida com
// cliente/grupo comercial do catálogo (crmConversationService.listCrmConversations).
// phoneId é opcional -- omitido, devolve todos os números visíveis ao
// usuário; informado, precisa pertencer ao escopo dele (senão 403).
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const params = request.nextUrl.searchParams;
    const status = params.get("status");
    const limitParam = params.get("limit");
    return execute(() =>
        crm.listCrmConversations(route.tenant, session.user, {
            phoneId: params.get("phoneId") ?? undefined,
            status: status === "open" || status === "closed" ? status : undefined,
            phoneNumber: params.get("phoneNumber") ?? undefined,
            cursor: params.get("cursor") ?? undefined,
            limit: limitParam ? Number(limitParam) : undefined,
        }),
    );
}
