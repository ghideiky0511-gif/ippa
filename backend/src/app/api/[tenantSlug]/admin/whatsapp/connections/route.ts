import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as whatsapp from "@/services/whatsapp";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Lista os telefones de WhatsApp já conectados à organização no
// bippa-messaging (para escolha/associação) -- também usado pela ação
// restrita "Verificar conexão" da tela de Integrações (ver
// whatsappIntegrationService.getWhatsAppConnections).
export async function GET(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const token = requestToken(request, route.tenant.slug);
    const session = await authentication.getAuthenticatedSession(route.tenant, token);
    if (!session)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(() =>
        whatsapp.getWhatsAppConnections(route.tenant, session.user),
    );
}
