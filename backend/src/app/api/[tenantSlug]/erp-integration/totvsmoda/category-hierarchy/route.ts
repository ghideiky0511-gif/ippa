import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as erp from "@/services/erp";

type RouteContext = { params: Promise<{ tenantSlug: string }> };
export const dynamic = "force-dynamic";

async function authenticatedRoute(request: NextRequest, context: RouteContext) {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const session = await authentication.getAuthenticatedSession(route.tenant, requestToken(request, route.tenant.slug));
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return { route, session };
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const resolved = await authenticatedRoute(request, context);
    if (resolved instanceof Response) return resolved;
    return execute(() => erp.getTotvsClassificationCatalog(resolved.route.tenant, resolved.session.user));
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
    const resolved = await authenticatedRoute(request, context);
    if (resolved instanceof Response) return resolved;
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    return execute(() => erp.saveTotvsCategoryHierarchyMapping(resolved.route.tenant, resolved.session.user, body));
}
