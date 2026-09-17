import { NextRequest, NextResponse } from "next/server";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import * as authentication from "@/services/auth";
import * as crm from "@/services/crm";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Consulta prévia da janela de 24h -- a UI usa para habilitar/desabilitar o
// compositor de texto livre antes de tentar enviar. Não substitui o
// tratamento do 422 no envio em si (a janela pode fechar entre a consulta e
// o envio).
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(() => crm.getCrmServiceWindow(route.tenant, session.user, route.params.id));
}
