import { NextRequest, NextResponse } from "next/server";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import * as authentication from "@/services/auth";
import * as orders from "@/services/orders";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Histórico de tentativas de envio deste pedido pelo WhatsApp
// (order_whatsapp_send_attempts, ver orderWhatsAppService.listOrderWhatsAppHistory)
// -- diferente da rota .../whatsapp, que só valida disponibilidade/dispara um
// envio novo.
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(() => orders.listOrderWhatsAppHistory(route.tenant, session.user, route.params.id));
}
