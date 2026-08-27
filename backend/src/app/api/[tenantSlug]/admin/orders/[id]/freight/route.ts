import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import { OrderFreightMethodSchema } from "@/contracts/shared";
import * as authentication from "@/services/auth";
import * as orders from "@/services/orders";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

export async function PUT(
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
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsedMethod = OrderFreightMethodSchema.safeParse(body.method);
    if (!parsedMethod.success)
        return NextResponse.json({ error: "Tipo de frete inválido." }, { status: 400 });
    return execute(() =>
        orders.updateOrderFreightMethod(route.tenant, session.user, id, parsedMethod.data, auditContext(request)),
    );
}
