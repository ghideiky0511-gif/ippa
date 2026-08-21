import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as clients from "@/services/clients";
import { NotFoundError } from "@/services/shared/errors";

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
    const session = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!session)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(async () => {
        const registration = await clients.getTenantClient(
            route.tenant,
            session.user,
            route.params.id,
        );
        if (!registration) throw new NotFoundError("CLIENT_NOT_FOUND");
        return registration;
    });
}

export async function PUT(
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
    const body = (await request.json().catch(() => null)) as Record<
        string,
        unknown
    > | null;
    if (!body)
        return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    const mutationContext = {
        ...auditContext(request),
        sessionId: authenticated.sessionId,
    };
    return execute(async () => {
        const updated = await clients.updateTenantClient(
            route.tenant,
            authenticated.user,
            route.params.id,
            body,
            mutationContext,
        );
        if (!updated) throw new NotFoundError("CLIENT_NOT_FOUND");
        return updated;
    });
}
