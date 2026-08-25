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

// Coligados do TOTVS Moda pro documento de um client — ver
// listErpRelatedPartiesForClient. clientId (não document) porque quem chama
// já está numa tela de client específico (ClientDetailApp).
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
    const clientId = request.nextUrl.searchParams.get("clientId") ?? "";
    if (!clientId)
        return NextResponse.json({ error: "Informe clientId." }, { status: 400 });
    return execute(() =>
        commercialGroups.listErpRelatedPartiesForClient(route.tenant, session.user, clientId),
    );
}
