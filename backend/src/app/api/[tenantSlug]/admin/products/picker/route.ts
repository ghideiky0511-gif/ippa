import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as catalog from "@/services/catalog";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const term = request.nextUrl.searchParams.get("q")?.trim() || undefined;
    const ids = request.nextUrl.searchParams.get("ids")
        ?.split(",")
        .map((id) => id.trim())
        .filter(Boolean);

    return execute(() => catalog.listProductPickerItemsAdmin(route.tenant, authenticated.user, {
        term,
        ids,
        limit: ids?.length ? Math.min(ids.length, 100) : 8,
    }));
}
