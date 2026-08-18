import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// Enriquecimento manual por produto (código, preço sugerido de revenda,
// markup, categoria/subcategoria/coleção) — dado da loja, não do ERP.
// Categoria/subcategoria sobrescrevem o que o ERP mandou quando editadas;
// coleção não tem origem no ERP hoje, só existe se preenchida aqui.
// Editável pela plataforma admin em
// /produtos (GET/PUT aqui). Mesmo padrão do /api/highlights: arquivo hoje,
// GET/PUT aqui, banco de verdade depois só troca o que tem dentro de cada
// handler. Mesclado por cima do catalog.json em web/src/lib/catalog.ts.
const DATA_PATH = path.join(process.cwd(), 'src/data/productOverrides.json');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3010',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Override = {
  sku?: string;
  suggestedRetailPrice?: number;
  markup?: number;
  similarProductIdsQuickview?: string[];
  similarProductIdsCart?: string[];
  category?: string;
  subcategory?: string;
  collection?: string;
};

function isValidStringArray(value: unknown): value is string[] {
  return value === undefined || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
}

function isValidOverrides(value: unknown): value is Record<string, Override> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((o) => {
    if (!o || typeof o !== 'object') return false;
    const {
      sku,
      suggestedRetailPrice,
      markup,
      similarProductIdsQuickview,
      similarProductIdsCart,
      category,
      subcategory,
      collection,
    } = o as Override;
    return (
      (sku === undefined || typeof sku === 'string') &&
      (suggestedRetailPrice === undefined || typeof suggestedRetailPrice === 'number') &&
      (markup === undefined || typeof markup === 'number') &&
      isValidStringArray(similarProductIdsQuickview) &&
      isValidStringArray(similarProductIdsCart) &&
      (category === undefined || typeof category === 'string') &&
      (subcategory === undefined || typeof subcategory === 'string') &&
      (collection === undefined || typeof collection === 'string')
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
      {
        error:
          'Formato inválido: esperado um objeto { [productId]: { sku?, suggestedRetailPrice?, markup?, similarProductIdsQuickview?, similarProductIdsCart?, category?, subcategory?, collection? } }.',
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(body, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);

  return NextResponse.json(body, { headers: CORS_HEADERS });
}
