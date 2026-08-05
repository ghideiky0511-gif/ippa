import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// Coleções nomeadas de produtos (ex. "Verão 2027"), mostradas no menu
// lateral e editáveis pela plataforma admin em /colecoes. Mesmo padrão do
// /api/home-sections: arquivo hoje, GET/PUT aqui, banco de verdade depois
// só troca o que tem dentro de cada handler.
const DATA_PATH = path.join(process.cwd(), 'src/data/highlights.json');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function isValidHighlights(value: unknown): value is Array<{ id: string; label: string; productIds: string[] }> {
  return (
    Array.isArray(value) &&
    value.every(
      (h) => h && typeof h.id === 'string' && typeof h.label === 'string' && Array.isArray(h.productIds)
    )
  );
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

  if (!isValidHighlights(body)) {
    return NextResponse.json(
      { error: 'Formato inválido: esperado um array de coleções com id, label e productIds.' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(body, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);

  return NextResponse.json(body, { headers: CORS_HEADERS });
}
