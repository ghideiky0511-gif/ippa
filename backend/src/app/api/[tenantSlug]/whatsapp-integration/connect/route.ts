import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as whatsapp from "@/services/whatsapp";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Recebe `code` e `wabaId` do callback do JS SDK do Embedded Signup (evento
// WA_EMBEDDED_SIGNUP) e conclui a conexão do número da vendedora autenticada.
export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const contextData = auditContext(request);
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const mutationContext = { ...contextData, sessionId: authenticated.sessionId };
    return execute(() =>
        whatsapp.completeWhatsAppOnboarding(
            route.tenant,
            authenticated.user,
            { code: String(body.code ?? ""), wabaId: String(body.wabaId ?? "") },
            mutationContext,
        ),
    );
}
