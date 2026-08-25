import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as commercialGroups from "@/services/commercialGroups";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

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
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(() =>
        commercialGroups.listCommercialGroups(
            route.tenant,
            session.user,
            request.nextUrl.searchParams.get("q") ?? undefined,
            request.nextUrl.searchParams.get("includeInactive") === "1",
        ),
    );
}

export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const contextData = auditContext(request);
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const mutationContext = { ...contextData, sessionId: authenticated.sessionId };
    return execute(
        () =>
            commercialGroups.createCommercialGroup(
                route.tenant,
                authenticated.user,
                body,
                mutationContext,
            ),
        201,
    );
}
