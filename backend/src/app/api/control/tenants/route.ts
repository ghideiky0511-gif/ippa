import { NextRequest, NextResponse } from 'next/server';
import { isControlRouteError, requirePlatformUser } from '@/lib/http/controlRoute';
import { listTenants, provisionTenant } from '@/services/platform';

export async function GET(request: NextRequest) {
  const user = await requirePlatformUser(request);
  if (isControlRouteError(user)) return user;
  return NextResponse.json({ tenants: await listTenants() });
}

export async function POST(request: NextRequest) {
  const user = await requirePlatformUser(request);
  if (isControlRouteError(user)) return user;
  const body = await request.json().catch(() => null);
  try {
    const tenant = await provisionTenant({
      slug: typeof body?.slug === 'string' ? body.slug : '',
      name: typeof body?.name === 'string' ? body.name : '',
      adminName: typeof body?.adminName === 'string' ? body.adminName : '',
      adminEmail: typeof body?.adminEmail === 'string' ? body.adminEmail : '',
      adminPassword: typeof body?.adminPassword === 'string' ? body.adminPassword : '',
    });
    return NextResponse.json({ tenant }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_SLUG') return NextResponse.json({ error: 'Slug inválido ou reservado.' }, { status: 400 });
    if (error instanceof Error && error.message === 'INVALID_TENANT_INPUT') return NextResponse.json({ error: 'Informe dados válidos e uma senha com ao menos 12 caracteres.' }, { status: 400 });
    if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'Este slug ou e-mail de administrador já está em uso.' }, { status: 409 });
    throw error;
  }
}
