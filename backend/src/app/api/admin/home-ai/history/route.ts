import { NextResponse } from 'next/server';
import { listHomeAiHistory } from '@/lib/homeAiHistory';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3010',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const history = await listHomeAiHistory();
  return NextResponse.json({ history }, { headers: CORS_HEADERS });
}
