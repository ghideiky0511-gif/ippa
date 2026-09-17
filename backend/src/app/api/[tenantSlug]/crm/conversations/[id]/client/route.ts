import { NextRequest, NextResponse } from "next/server";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import * as authentication from "@/services/auth";
import * as crm from "@/services/crm";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Vincula (ou desvincula, com clientId: null) manualmente a conversa a um
// cliente do catálogo -- sempre grava link_source: 'manual', que nunca é
// sobrescrito pelo auto-match de listCrmConversations depois.
export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const body = await request.json().catch(() => null);
    const mutationContext = { ...auditContext(request), sessionId: session.sessionId };
    return execute(() =>
        crm.linkCrmConversationClient(route.tenant, session.user, route.params.id, body, mutationContext),
    );
}
