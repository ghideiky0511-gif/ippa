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

// Envia texto livre dentro da janela de 24h (POST /v1/conversations/:id/reply
// no bippa-messaging). sellerReference/recipient nunca vêm do corpo --
// sempre resolvidos localmente por requireKnownConversationScope a partir
// do conversationId. Mesmo teto de 10/min por usuário de
// admin/orders/[id]/whatsapp.
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const limit = await rateLimit("crm-chat-send", `${route.tenant.id}:${session.user.id}`, 10, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = await request.json().catch(() => null);
    const mutationContext = { ...auditContext(request), sessionId: session.sessionId };
    return execute(() =>
        crm.sendCrmText(route.tenant, session.user, route.params.id, body, mutationContext),
    );
}
