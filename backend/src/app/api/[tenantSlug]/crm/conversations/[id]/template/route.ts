import { NextRequest, NextResponse } from "next/server";
import { auditContext, execute, rateLimit, requestToken, tooManyRequests } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import * as authentication from "@/services/auth";
import * as crm from "@/services/crm";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Envia um template já vinculado ao perfil de envio da vendedora dona da
// conversa (kind: "template" em POST /v1/dispatches) -- único caminho fora
// da janela de 24h. sellerReference/recipient nunca vêm do corpo, mesma
// resolução local de reply/route.ts.
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const limit = rateLimit("crm-chat-send", `${route.tenant.id}:${session.user.id}`, 10, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = await request.json().catch(() => null);
    const mutationContext = { ...auditContext(request), sessionId: session.sessionId };
    return execute(() =>
        crm.sendCrmTemplate(route.tenant, session.user, route.params.id, body, mutationContext),
    );
}
