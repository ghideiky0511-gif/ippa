import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// Ordem customizada dos cards no /catalogo — todos do mesmo tamanho, só a
// posição é editável (ver /catalogo na plataforma admin,
// admin/src/components/catalog/CatalogOrderApp.js, arrastar em qualquer
// direção pra reordenar). Lista de IDs de produto; produtos fora da lista
// (ex. recém-chegados do ERP, ainda não posicionados) aparecem depois, na
// ordem natural do catalog.json — ver applyCatalogOrder em
// web/src/lib/catalog.ts. Mesmo padrão do /api/highlights: arquivo hoje,
// GET/PUT aqui, banco de verdade depois só troca o que tem dentro de cada
// handler.
const DATA_PATH = path.join(process.cwd(), 'src/data/catalogOrder.json');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3010',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function isValidOrder(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
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

  if (!isValidOrder(body)) {
    return NextResponse.json(
      { error: 'Formato inválido: esperado um array de IDs de produto.' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(body, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);

  return NextResponse.json(body, { headers: CORS_HEADERS });
}
