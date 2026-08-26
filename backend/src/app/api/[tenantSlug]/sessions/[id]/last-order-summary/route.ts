import { NextRequest, NextResponse } from 'next/server';
import { execute, requestToken } from '@/lib/http/apiHelpers';
import { isTenantRouteError, resolveTenantRoute } from '@/lib/http/tenantRoute';
import * as authentication from '@/services/auth';
import { catalogOrderResume } from '@/services/ai/catalogOrderResumeService';

type RouteContext = { params: Promise<{ tenantSlug: string; id: string }> };

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const route = await resolveTenantRoute(request, context.params);
  if (isTenantRouteError(route)) return route;
  const authenticated = await authentication.getAuthenticatedSession(
    route.tenant,
    requestToken(request, route.tenant.slug),
  );
  if (!authenticated) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  return execute(() => catalogOrderResume(route.tenant, authenticated.user, route.params.id));
}
