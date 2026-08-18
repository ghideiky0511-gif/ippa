import { NextRequest, NextResponse } from 'next/server';
import { isControlRouteError, requirePlatformUser } from '@/lib/http/controlRoute';

export async function GET(request: NextRequest) {
  const user = await requirePlatformUser(request);
  return isControlRouteError(user) ? user : NextResponse.json({ user });
}
