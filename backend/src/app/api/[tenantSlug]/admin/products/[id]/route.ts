import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as catalog from "@/services/catalog";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const route = await resolveTenantRoute(request, context.params);
  if (isTenantRouteError(route)) return route;
  const authenticated = await authentication.getAuthenticatedSession(route.tenant, requestToken(request, route.tenant.slug));
  if (!authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return execute(() => catalog.getProductAdmin(route.tenant, authenticated.user, route.params.id));
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  const route = await resolveTenantRoute(request, context.params);
  if (isTenantRouteError(route)) return route;
  const authenticated = await authentication.getAuthenticatedSession(route.tenant, requestToken(request, route.tenant.slug));
  if (!authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  return execute(() => catalog.updateManualProduct(route.tenant, authenticated.user, route.params.id, body));
}
