import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// Enriquecimento manual por produto (código, preço sugerido de revenda,
// markup) — dado da loja, não do ERP. Editável pela plataforma admin em
// /produtos (GET/PUT aqui). Mesmo padrão do /api/highlights: arquivo hoje,
// GET/PUT aqui, banco de verdade depois só troca o que tem dentro de cada
// handler. Mesclado por cima do catalog.json em web/src/lib/catalog.ts.
const DATA_PATH = path.join(process.cwd(), 'src/data/productOverrides.json');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Override = { sku?: string; suggestedRetailPrice?: number; markup?: number };

function isValidOverrides(value: unknown): value is Record<string, Override> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((o) => {
    if (!o || typeof o !== 'object') return false;
    const { sku, suggestedRetailPrice, markup } = o as Override;
    return (
      (sku === undefined || typeof sku === 'string') &&
      (suggestedRetailPrice === undefined || typeof suggestedRetailPrice === 'number') &&
      (markup === undefined || typeof markup === 'number')
    );
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const raw = await readFile(DATA_PATH, 'utf-8');
  return NextResponse.json(JSON.parse(raw), { headers: CORS_HEADERS });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  if (!isValidOverrides(body)) {
    return NextResponse.json(
      { error: 'Formato inválido: esperado um objeto { [productId]: { sku?, suggestedRetailPrice?, markup? } }.' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(body, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);

  return NextResponse.json(body, { headers: CORS_HEADERS });
}
