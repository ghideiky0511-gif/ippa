import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, parseIdsParam } from "@/lib/http/apiHelpers";
import * as catalog from "@/services/catalog";

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
    const params = request.nextUrl.searchParams;
    return execute(() =>
        catalog.listCatalogSections(route.tenant, {
            term: params.get("term") || undefined,
            category: params.get("category") || undefined,
            subcategory: params.get("subcategory") || undefined,
            color: params.get("color") || undefined,
            size: params.get("size") || undefined,
            restrictIds: parseIdsParam(params.get("restrictIds")),
            excludeIds: parseIdsParam(params.get("excludeIds")),
            pageSize: Number(params.get("pageSize")) || undefined,
        }),
    );
}
