import { NextRequest, NextResponse } from 'next/server';
import { isControlRouteError, requirePlatformUser } from '@/lib/http/controlRoute';
import { errorMeta, logger } from '@/lib/logger';
import { importVestiCatalog } from '@/services/platform';
import { VestiCatalogFeedError } from '@/catalog/vesti';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformUser(request);
  if (isControlRouteError(user)) return user;
  const { id } = await context.params;
  try {
    const summary = await importVestiCatalog(id);
    return NextResponse.json({ summary });
  } catch (error) {
    if (error instanceof Error && error.message === 'TENANT_NOT_FOUND') return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });
    if (error instanceof Error && error.message === 'VESTI_SLUG_NOT_CONFIGURED') return NextResponse.json({ error: 'Configure o slug da Vesti antes de importar.' }, { status: 400 });
    if (error instanceof Error && error.message === 'VESTI_BOOTSTRAP_AFTER_ERP') return NextResponse.json({ error: 'O bootstrap da Vesti só pode ser executado antes da ativação do ERP.' }, { status: 409 });
    if (error instanceof VestiCatalogFeedError) {
      logger.warn('vesti-import', 'Feed da Vesti indisponível', { tenantId: id, ...errorMeta(error), statusCode: error.statusCode, endpoint: error.endpoint });
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    logger.error('vesti-import', 'Falha ao importar o catálogo da Vesti no Control', { tenantId: id, ...errorMeta(error) });
    return NextResponse.json({ error: 'Não foi possível importar o catálogo da Vesti.' }, { status: 500 });
  }
}
