import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as erp from "@/services/erp";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Status do envio de UM pedido ao ERP ativo (provider_orders, ver
// orderPushService.orderPushStatus). null quando o pedido nunca foi
// enfileirado (ex.: tenant sem ERP ativo no momento do pagamento) -- não é
// erro, é "nada para mostrar ainda".
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
    const orderId = request.nextUrl.searchParams.get("orderId") ?? "";
    if (!orderId)
        return NextResponse.json({ error: "Informe orderId." }, { status: 400 });
    return execute(() => erp.orderPushStatus(route.tenant, session.user, orderId));
}

// Força reenvio: cancela no ERP (se já tinha sido enviado) e envia de novo.
// Ver requestProviderOrderResend -- decide sozinho se precisa cancelar
// antes, o caller só pede "reenvia".
export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const orderId = String(body.orderId ?? "");
    if (!orderId)
        return NextResponse.json({ error: "Informe orderId." }, { status: 400 });
    return execute(() =>
        erp.requestProviderOrderResend(route.tenant, authenticated.user, orderId, auditContext(request)),
    );
}
