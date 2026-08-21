import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as users from "@/services/users";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

async function authenticatedSession(request: NextRequest, context: RouteContext) {
  const route = await resolveTenantRoute(request, context.params);
  if (isTenantRouteError(route)) return route;
  const authenticated = await authentication.getAuthenticatedSession(
    route.tenant,
    requestToken(request, route.tenant.slug),
  );
  if (!authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return { route, authenticated };
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const session = await authenticatedSession(request, context);
  if (session instanceof NextResponse) return session;
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("avatar");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie o arquivo do avatar." }, { status: 400 });
  const contextData = { ...auditContext(request), sessionId: session.authenticated.sessionId };
  return execute(async () => users.uploadOwnAvatar(session.route.tenant, session.authenticated.user, {
    bytes: Buffer.from(await file.arrayBuffer()),
    contentType: file.type,
  }, contextData));
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  const session = await authenticatedSession(request, context);
  if (session instanceof NextResponse) return session;
  const contextData = { ...auditContext(request), sessionId: session.authenticated.sessionId };
  return execute(() => users.removeOwnAvatar(session.route.tenant, session.authenticated.user, contextData));
}
