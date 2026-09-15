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

// Estado local de referência da conexão de CADA vendedora deste tenant
// (whatsapp_connections) -- não é um dos 4 endpoints A-D do plano original,
// adicionado para a tela de Integrações mostrar "conectado"/"não conectado"
// por vendedora no carregamento sem depender de uma chamada remota ao
// bippa-messaging a cada acesso (ver
// whatsappIntegrationService.listTenantWhatsAppConnectionStatuses).
export async function GET(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(() => whatsapp.listTenantWhatsAppConnectionStatuses(route.tenant, session.user));
}
