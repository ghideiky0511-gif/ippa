import { NextRequest, NextResponse } from 'next/server';
import { isControlRouteError, requirePlatformUser } from '@/lib/http/controlRoute';
import { createTenantAdministrator } from '@/services/platform';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformUser(request);
  if (isControlRouteError(user)) return user;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  try {
    const tenantUser = await createTenantAdministrator(id, {
      name: typeof body?.name === 'string' ? body.name : '',
      email: typeof body?.email === 'string' ? body.email : '',
      password: typeof body?.password === 'string' ? body.password : '',
    });
    return NextResponse.json({ user: tenantUser }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_TENANT_ID') return NextResponse.json({ error: 'Tenant inválido.' }, { status: 400 });
    if (error instanceof Error && error.message === 'INVALID_TENANT_ADMIN_INPUT') return NextResponse.json({ error: 'Informe dados válidos e uma senha com ao menos 12 caracteres.' }, { status: 400 });
    if (error instanceof Error && error.message === 'TENANT_NOT_FOUND') return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });
    if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'Este e-mail já está em uso neste tenant.' }, { status: 409 });
    throw error;
  }
}
