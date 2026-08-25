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

// Diz se o tenant tem uma integração ativa capaz de listar coligados (hoje,
// só TOTVS Moda) — ver hasErpRelatedPartiesCapability. Usado pela tela de
// detalhe da cliente pra decidir se mostra a seção de coligados, sem expor
// nenhum dado de credencial (diferente de GET /erp-integration, que exige
// permissão de administrador de settings).
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
    return execute(async () => ({
        available: await commercialGroups.hasErpRelatedPartiesCapability(route.tenant, session.user),
    }));
}
