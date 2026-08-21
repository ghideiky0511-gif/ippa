import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute } from "@/lib/http/apiHelpers";
import * as orders from "@/services/orders";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

export async function GET(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    return execute(() => orders.paymentSummary(route.tenant, route.params.id));
}

export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;
    return execute(() =>
        orders.confirmPayment(
            route.tenant,
            route.params.id,
            typeof body.paymentMethod === "string"
                ? body.paymentMethod
                : undefined,
        ),
    );
}
