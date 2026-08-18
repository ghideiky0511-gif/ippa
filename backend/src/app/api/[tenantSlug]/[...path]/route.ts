import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantRoute, isTenantRouteError } from '@/lib/http/tenantRoute';
import * as authentication from '@/services/auth';
import type { AuditRequestContext } from '@/services/audit';
import * as catalog from '@/services/catalog';
import * as clients from '@/services/clients';
import * as orders from '@/services/orders';
import * as settings from '@/services/settings';
import * as users from '@/services/users';
import { ConflictError, ForbiddenError } from '@/services/shared/errors';

type RouteContext = { params: Promise<{ tenantSlug: string; path: string[] }> };

function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 7 };
}

function requestToken(request: NextRequest, tenantSlug: string): string | undefined {
  return request.cookies.get(authentication.sessionCookieName(tenantSlug))?.value
    ?? request.cookies.get('ippa_admin_session')?.value
    ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
}

function requestAuditContext(request: NextRequest): AuditRequestContext {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  const ipAddress = [forwardedFor, realIp].find((value): value is string => typeof value === 'string' && isIP(value) !== 0);
  const userAgent = request.headers.get('user-agent')?.slice(0, 512);
  return { requestId: randomUUID(), ipAddress, userAgent };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const route = await resolveTenantRoute(request, context.params);
  if (isTenantRouteError(route)) return route;
  const tenant = route.tenant;
  const endpoint = route.params.path.join('/');
  const token = requestToken(request, route.tenant.slug);

  async function authenticatedUser() {
    const user = await authentication.getUserForToken(tenant, token);
    return user ?? null;
  }

  if (route.params.path[0] === 'clients' && route.params.path[1]) {
    const user = await authenticatedUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    try {
      const client = await clients.getTenantClient(route.tenant, user, route.params.path[1]);
      return client ? NextResponse.json(client) : NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 });
    } catch (error) {
      if (error instanceof ForbiddenError) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
      throw error;
    }
  }

  switch (endpoint) {
    case 'tenant': return NextResponse.json({ slug: tenant.slug, name: tenant.name });
    case 'catalog': return NextResponse.json(await catalog.listCatalog(route.tenant));
    case 'discounts': return NextResponse.json(await settings.listDiscounts(route.tenant));
    case 'highlights': return NextResponse.json(await settings.listHighlights(route.tenant));
    case 'home-sections': return NextResponse.json(await settings.listHomeSections(route.tenant));
    case 'store-settings': return NextResponse.json(await settings.getStoreSettings(route.tenant));
    case 'similar-products-settings': return NextResponse.json(await settings.getSimilarProductsSettings(route.tenant));
    case 'auth/me': {
      const user = await authentication.getUserForToken(route.tenant, token);
      return user ? NextResponse.json({ user }) : NextResponse.json({ user: null }, { status: 401 });
    }
    case 'admin/auth/me': {
      const user = await authentication.getUserForToken(route.tenant, token);
      return users.isAdministrator(user) ? NextResponse.json(user) : NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    case 'clients': {
      const user = await authenticatedUser();
      if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
      try { return NextResponse.json(await clients.searchTenantClients(route.tenant, user, request.nextUrl.searchParams.get('q') ?? undefined)); }
      catch (error) { if (error instanceof ForbiddenError) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 }); throw error; }
    }
    case 'sessions': {
      const user = await authenticatedUser();
      if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
      try { return NextResponse.json(await orders.sellerSessions(route.tenant, user)); }
      catch (error) { if (error instanceof ForbiddenError) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 }); throw error; }
    }
    case 'orders': {
      const user = await authenticatedUser();
      if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
      try { return NextResponse.json(await orders.userOrders(route.tenant, user)); }
      catch (error) { if (error instanceof ForbiddenError) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 }); throw error; }
    }
    case 'admin/users': {
      const user = await authenticatedUser();
      if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
      try { return NextResponse.json(await users.users(route.tenant, user)); }
      catch (error) { if (error instanceof ForbiddenError) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 }); throw error; }
    }
    case 'admin/clients': {
      const user = await authenticatedUser();
      if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
      try { return NextResponse.json(await clients.searchTenantClients(route.tenant, user)); }
      catch (error) { if (error instanceof ForbiddenError) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 }); throw error; }
    }
    default: return NextResponse.json({ error: 'Rota não encontrada.' }, { status: 404 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const route = await resolveTenantRoute(request, context.params);
  if (isTenantRouteError(route)) return route;
  const endpoint = route.params.path.join('/');
  const auditContext = requestAuditContext(request);
  if (endpoint === 'auth/login') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
      return NextResponse.json({ error: 'Informe email e senha.' }, { status: 400 });
    }
    const result = await authentication.login(route.tenant, body.email, body.password, auditContext);
    if (!result) return NextResponse.json({ error: 'Email ou senha inválidos.' }, { status: 401 });
    const response = NextResponse.json({ user: result.user });
    response.cookies.set(authentication.sessionCookieName(route.tenant.slug), result.token, cookieOptions());
    return response;
  }
  if (endpoint === 'admin/auth/login') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400 });
    const result = await authentication.login(route.tenant, body.email, body.password, auditContext);
    if (!result || !users.isAdministrator(result.user)) return NextResponse.json({ error: 'E-mail, senha ou permissão de acesso inválidos.' }, { status: 401 });
    return NextResponse.json({ token: result.token, user: result.user });
  }
  if (endpoint === 'auth/logout') {
    await authentication.logout(route.tenant, requestToken(request, route.tenant.slug), auditContext);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(authentication.sessionCookieName(route.tenant.slug), '', { ...cookieOptions(), maxAge: 0 });
    return response;
  }
  if (endpoint === 'admin/auth/logout') {
    await authentication.logout(route.tenant, request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''), auditContext);
    return NextResponse.json({ ok: true });
  }
  const user = await authentication.getUserForToken(route.tenant, requestToken(request, route.tenant.slug));
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const authenticated = await authentication.getAuthenticatedSession(route.tenant, requestToken(request, route.tenant.slug));
  if (!authenticated) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const mutationContext = { ...auditContext, sessionId: authenticated.sessionId };
  const body = await request.json().catch(() => ({}));
  try {
    if (endpoint === 'admin/users') return NextResponse.json(await users.createTenantUser(route.tenant, user, body, mutationContext), { status: 201 });
    if (endpoint === 'clients') return NextResponse.json(await clients.createTenantClient(route.tenant, user, body, mutationContext), { status: 201 });
    if (endpoint === 'sessions') return NextResponse.json(await orders.createSellerSession(route.tenant, user, body, mutationContext), { status: 201 });
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    if (error instanceof ConflictError) return NextResponse.json({ error: 'Já existe cadastro com esse CPF/CNPJ.' }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ error: 'Rota não encontrada.' }, { status: 404 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const route = await resolveTenantRoute(request, context.params);
  if (isTenantRouteError(route)) return route;
  const [resource, id, action] = route.params.path;
  const user = await authentication.getUserForToken(route.tenant, requestToken(request, route.tenant.slug));
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const authenticated = await authentication.getAuthenticatedSession(route.tenant, requestToken(request, route.tenant.slug));
  if (!authenticated) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const mutationContext = { ...requestAuditContext(request), sessionId: authenticated.sessionId };
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  try {
    if (resource === 'clients' && id && action === 'cart') {
      if (!Array.isArray(body.items)) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
      await clients.saveClientCart(route.tenant, user, id, body.items, mutationContext);
      return NextResponse.json({ ok: true });
    }
    if (resource === 'clients' && id) {
      const client = await clients.updateTenantClient(route.tenant, user, id, body, mutationContext);
      return client ? NextResponse.json(client) : NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 });
    }
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    if (error instanceof ConflictError) return NextResponse.json({ error: 'Já existe cadastro com esse CPF/CNPJ.' }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ error: 'Rota não encontrada.' }, { status: 404 });
}
