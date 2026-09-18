import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, parseIdsParam } from "@/lib/http/apiHelpers";
import * as catalog from "@/services/catalog";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Toda leitura pública usa o mesmo motor filtrado e paginado. Não existe mais
// uma variante sem parâmetros que materialize o catálogo inteiro na resposta.
export async function GET(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const params = request.nextUrl.searchParams;
    return execute(() =>
        catalog.listCatalogPage(route.tenant, {
            page: Number(params.get("page")) || undefined,
            pageSize: Number(params.get("pageSize")) || undefined,
            term: params.get("term") || undefined,
            classificationId: params.get("classificationId") || undefined,
            color: params.get("color") || undefined,
            size: params.get("size") || undefined,
            ids: parseIdsParam(params.get("ids")),
            excludeIds: parseIdsParam(params.get("excludeIds")),
            restrictIds: parseIdsParam(params.get("restrictIds")),
            excludeFeatured: params.get("excludeFeatured") === "1",
        }),
    );
}
