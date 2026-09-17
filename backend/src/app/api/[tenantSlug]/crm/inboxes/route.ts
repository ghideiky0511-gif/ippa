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

// Números WABA visíveis ao usuário logado -- admin vê todas as vendedoras
// com conexão ativa, vendedora vê só a própria (ver
// crmAuthorization.resolveVisibleInboxes). A UI usa isto para o seletor de
// número no topo da aba Conversas (só aparece com mais de um inbox).
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(() => crm.listCrmInboxes(route.tenant, session.user));
}
