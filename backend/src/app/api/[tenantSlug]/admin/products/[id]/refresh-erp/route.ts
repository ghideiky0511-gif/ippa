import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as catalog from "@/services/catalog";

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = "force-dynamic";

// Esta rota usa a sessão do workspace. O segredo da rota interna continua
// restrito a automações servidor-a-servidor e nunca chega ao navegador.
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const route = await resolveTenantRoute(request, context.params);
  if (isTenantRouteError(route)) return route;
  const authenticated = await authentication.getAuthenticatedSession(route.tenant, requestToken(request, route.tenant.slug));
  if (!authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return execute(() => catalog.refreshProductFromErp(route.tenant, authenticated.user, route.params.id));
}
