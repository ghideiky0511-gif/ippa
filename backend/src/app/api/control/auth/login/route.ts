import { NextRequest, NextResponse } from 'next/server';
import { authenticatePlatform, issuePlatformSession } from '@/services/platformService';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400 });

  const user = await authenticatePlatform(email, password);
  if (!user) return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 });
  return NextResponse.json({ token: await issuePlatformSession(user.id), user });
}
