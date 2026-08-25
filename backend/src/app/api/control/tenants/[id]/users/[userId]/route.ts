import { NextRequest, NextResponse } from 'next/server';
import { isControlRouteError, requirePlatformUser } from '@/lib/http/controlRoute';
import { deleteTenantUser } from '@/services/platform';

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; userId: string }> }) {
  const user = await requirePlatformUser(request);
  if (isControlRouteError(user)) return user;
  const { id, userId } = await context.params;
  try {
    await deleteTenantUser(id, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_TENANT_USER_ID') return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
    if (error instanceof Error && error.message === 'TENANT_NOT_FOUND') return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    throw error;
  }
}
