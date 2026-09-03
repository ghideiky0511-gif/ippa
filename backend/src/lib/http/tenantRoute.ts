import { NextRequest, NextResponse } from 'next/server';
import { findActiveTenant, type Tenant } from '@/lib/db/tenant';
import { clientIp, rateLimit, tooManyRequests, isTrustedInternalRequest, GENERAL_RATE_LIMIT } from '@/lib/http/apiHelpers';

export type TenantRouteContext<TParams extends { tenantSlug: string } = { tenantSlug: string }> = { tenant: Tenant; params: TParams };

export async function resolveTenantRoute<TParams extends { tenantSlug: string }>(
  request: NextRequest,
  params: Promise<TParams>,
): Promise<TenantRouteContext<TParams> | NextResponse> {
  // O SSR e o proxy do Next batem aqui como "cliente" único (poucos IPs de
  // egress no Render), então uma page view com vários GETs em paralelo +
  // prefetch estoura o balde por IP. Essas chamadas vêm assinadas com
  // INTERNAL_REQUEST_TOKEN e ficam de fora — o limite continua valendo pro
  // tráfego que chega direto do navegador ao backend público.
  if (!isTrustedInternalRequest(request)) {
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
