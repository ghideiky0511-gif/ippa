import { NextRequest, NextResponse } from 'next/server';
import { controlToken } from '@/lib/http/controlRoute';
import { logoutPlatform } from '@/services/platformService';

export async function POST(request: NextRequest) {
  await logoutPlatform(controlToken(request));
  return new NextResponse(null, { status: 204 });
}
