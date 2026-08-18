import { NextRequest, NextResponse } from 'next/server';
import { isControlRouteError, requirePlatformUser } from '@/lib/http/controlRoute';
import { changeTenantStatus } from '@/services/platformService';

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
