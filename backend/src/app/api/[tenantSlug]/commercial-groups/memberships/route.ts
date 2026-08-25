import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as commercialGroups from "@/services/commercialGroups";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Lookup em lote de memberships ativas por clientId — ver
// listCommercialGroupMembershipsByClientIds. Usado pelo talão pra agrupar
// sessões abertas de matriz/filiais.
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
    const clientIds = (request.nextUrl.searchParams.get("clientIds") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    return execute(() =>
        commercialGroups.listCommercialGroupMembershipsByClientIds(route.tenant, session.user, clientIds),
    );
}
