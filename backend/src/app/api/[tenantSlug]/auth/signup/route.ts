import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, cookieOptions, execute } from "@/lib/http/apiHelpers";
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
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;
    const contextData = auditContext(request);
    const response = await execute(() =>
        authentication.signupCustomer(route.tenant, body, contextData),
    );
    if (response.status !== 200) return response;
    const payload = (await response.json()) as {
        user: unknown;
        token: string;
    };
    const result = NextResponse.json({ user: payload.user });
    result.cookies.set(
        authentication.sessionCookieName(route.tenant.slug),
        payload.token,
        cookieOptions(),
    );
    return result;
}
