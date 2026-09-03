import { NextRequest, NextResponse } from 'next/server';
import { findActiveTenant, type Tenant } from '@/lib/db/tenant';
import { clientIp, rateLimit, tooManyRequests, isTrustedInternalRequest, GENERAL_RATE_LIMIT } from '@/lib/http/apiHelpers';

export type TenantRouteContext<TParams extends { tenantSlug: string } = { tenantSlug: string }> = { tenant: Tenant; params: TParams };

export async function resolveTenantRoute<TParams extends { tenantSlug: string }>(
  request: NextRequest,
  params: Promise<TParams>,
): Promise<TenantRouteContext<TParams> | NextResponse> {
  // Limite "geral" (baseline por IP em toda rota de tenant) é opt-in: só vale
  // com GENERAL_RATE_LIMIT_ENABLED=true. Fora dele, o rate limit por IP não
  // distingue clientes atrás de proxy/NAT ou dos IPs de egress compartilhados
  // do Render — uma page view do catálogo (vários GETs + prefetch do Next)
  // caía toda no mesmo balde e retornava 429. Os limites sensíveis a
  // brute-force (login, signup, document-access) são contados à parte no
  // próprio route handler e continuam sempre ativos. Chamadas de servidor
  // confiáveis (SSR/proxy) assinadas com INTERNAL_REQUEST_TOKEN ficam de fora
  // mesmo quando o baseline está ligado.
  if (GENERAL_RATE_LIMIT.enabled && !isTrustedInternalRequest(request)) {
    const limitResult = rateLimit('general', clientIp(request), GENERAL_RATE_LIMIT.limit, GENERAL_RATE_LIMIT.windowMs);
    if (!limitResult.allowed) return tooManyRequests(limitResult.retryAfterSeconds);
  }
  const resolved = await params;
  const slug = resolved.tenantSlug;
  const tenant = slug ? await findActiveTenant(slug) : null;
  if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });
  return { tenant, params: resolved };
}

export function isTenantRouteError<TParams extends { tenantSlug: string }>(value: TenantRouteContext<TParams> | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
