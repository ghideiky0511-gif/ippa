import { NextRequest, NextResponse } from "next/server";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import { requestToken } from "@/lib/http/apiHelpers";
import { getAiAvailability } from "@/services/ai";
import * as authentication from "@/services/auth";

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
    return NextResponse.json(await getAiAvailability());
}
