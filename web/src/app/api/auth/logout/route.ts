import { NextRequest, NextResponse } from 'next/server';
import { destroySessionToken, SESSION_COOKIE } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySessionToken(token);

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
