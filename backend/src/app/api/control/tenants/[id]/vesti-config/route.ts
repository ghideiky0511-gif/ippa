import { NextRequest, NextResponse } from 'next/server';
import { isControlRouteError, requirePlatformUser } from '@/lib/http/controlRoute';
import { errorMeta, logger } from '@/lib/logger';
import { getVestiCatalogSlug, setVestiCatalogSlug } from '@/services/platform';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformUser(request);
  if (isControlRouteError(user)) return user;
  const { id } = await context.params;
  try {
    const slug = await getVestiCatalogSlug(id);
    return NextResponse.json({ slug });
  } catch (error) {
    if (error instanceof Error && error.message === 'TENANT_NOT_FOUND') return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });
    logger.error('vesti-config', 'Falha ao carregar a configuração da Vesti no Control', errorMeta(error));
    return NextResponse.json({ error: 'Não foi possível carregar a configuração da Vesti.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformUser(request);
  if (isControlRouteError(user)) return user;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  try {
    const slug = await setVestiCatalogSlug(id, typeof body?.slug === 'string' ? body.slug : '');
    return NextResponse.json({ slug });
  } catch (error) {
    if (error instanceof Error && error.message === 'TENANT_NOT_FOUND') return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });
    if (error instanceof Error && error.message === 'INVALID_VESTI_SLUG') return NextResponse.json({ error: 'Informe um slug válido.' }, { status: 400 });
    throw error;
  }
}
