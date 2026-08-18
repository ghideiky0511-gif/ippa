import { NextRequest, NextResponse } from 'next/server';
import { isControlRouteError, requirePlatformUser } from '@/lib/http/controlRoute';
import { changeTenantStatus, listTenantUsers } from '@/services/platformService';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformUser(request);
  if (isControlRouteError(user)) return user;
  const { id } = await context.params;
  try {
    const users = await listTenantUsers(id);
    return users ? NextResponse.json({ users }) : NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_TENANT_ID') {
      return NextResponse.json({ error: 'Tenant inválido.' }, { status: 400 });
    }
    console.error('Falha ao listar usuários do tenant no Control.', error);
    return NextResponse.json({ error: 'Não foi possível carregar os usuários do tenant.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformUser(request);
  if (isControlRouteError(user)) return user;
  const body = await request.json().catch(() => null);
  const { id } = await context.params;
  try {
    const tenant = await changeTenantStatus(id, typeof body?.status === 'string' ? body.status : '');
    return tenant ? NextResponse.json({ tenant }) : NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Status ou tenant inválido.' }, { status: 400 });
  }
}
