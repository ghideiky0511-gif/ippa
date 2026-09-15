import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as whatsapp from "@/services/whatsapp";

type RouteContext = {
    params: Promise<{ tenantSlug: string; sellerId: string }>;
};

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Nunca chamado por onboarding ou reassociação. A administradora precisa
// confirmar manualmente a aprovação de Orders/Payments pela Meta e deixar o
// motivo que irá para as trilhas de auditoria local e do bippa-messaging.
export async function PATCH(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const token = requestToken(request, route.tenant.slug);
    const session = await authentication.getAuthenticatedSession(route.tenant, token);
    if (!session)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
    return execute(() =>
        whatsapp.enableWhatsAppPaymentsCapability(
            route.tenant,
            session.user,
            route.params.sellerId,
            body?.reason,
            { ...auditContext(request), sessionId: session.sessionId },
        ),
    );
}
