import { NextRequest, NextResponse } from "next/server";
import { UpdateDeliveryTypeInputSchema } from "@/contracts/shared";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as orders from "@/services/orders";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const parsed = UpdateDeliveryTypeInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Configuração de entrega inválida.", issues: parsed.error.issues }, { status: 400 });
    }
    return execute(() => orders.updateDeliveryType(
        route.tenant,
        authenticated.user,
        route.params.id,
        parsed.data,
        auditContext(request),
    ));
}
