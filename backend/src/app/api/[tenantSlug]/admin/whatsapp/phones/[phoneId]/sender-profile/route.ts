import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as whatsapp from "@/services/whatsapp";

type RouteContext = { params: Promise<{ tenantSlug: string; phoneId: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Vincula o telefone `phoneId` (já conectado no bippa-messaging) ao sender
// profile da vendedora `sellerId` (no corpo) -- só depois desta chamada
// confirmar é que a UI pode mostrar "conectado" (ver
// whatsappIntegrationService.associateWhatsAppSenderProfile).
export async function PATCH(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const contextData = auditContext(request);
    const token = requestToken(request, route.tenant.slug);
    const authenticated = await authentication.getAuthenticatedSession(route.tenant, token);
    if (!authenticated)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { sellerId?: string } | null;
    if (!body?.sellerId)
        return NextResponse.json({ error: "sellerId é obrigatório." }, { status: 400 });
    const mutationContext = { ...contextData, sessionId: authenticated.sessionId };
    return execute(() =>
        whatsapp.associateWhatsAppSenderProfile(
            route.tenant,
            authenticated.user,
            body.sellerId!,
            route.params.phoneId,
            mutationContext,
        ),
    );
}
