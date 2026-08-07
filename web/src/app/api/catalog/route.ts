import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog';

// Hoje serve o catalog.json estático. Na Fase 2 este é o ponto de troca
// para buscar os dados de verdade na API da Bippa/ERP sem mudar o front.

// CORS liberado pro admin (porta diferente em dev) poder ler os produtos
// pra prévia visual do editor — mesmo padrão de /api/home-sections.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const catalog = await getCatalog();
  return NextResponse.json(catalog, { headers: CORS_HEADERS });
}
