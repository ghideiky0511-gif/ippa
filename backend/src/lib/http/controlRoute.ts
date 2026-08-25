import { NextRequest, NextResponse } from 'next/server';
import { getPlatformUser, type PlatformUser } from '@/services/platform';

function bearerToken(request: NextRequest): string | undefined {
  const value = request.headers.get('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7) : undefined;
}

export async function requirePlatformUser(request: NextRequest): Promise<PlatformUser | NextResponse> {
  const user = await getPlatformUser(bearerToken(request));
  return user ?? NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
}

export function isControlRouteError(value: PlatformUser | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function controlToken(request: NextRequest): string | undefined {
  return bearerToken(request);
}
