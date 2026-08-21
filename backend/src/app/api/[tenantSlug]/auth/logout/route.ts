import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, cookieOptions, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const contextData = auditContext(request);
    await authentication.logout(
        route.tenant,
        requestToken(request, route.tenant.slug),
        contextData,
    );
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
        authentication.sessionCookieName(route.tenant.slug),
        "",
        { ...cookieOptions(), maxAge: 0 },
    );
    return response;
}
