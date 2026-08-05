import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// Fonte viva da home (ver web/src/app/page.tsx). Editada pela plataforma
// admin (fora deste app, roda em outra porta em dev) via GET/PUT aqui.
// Mesmo padrão do /api/catalog: arquivo estático hoje, ponto de troca pra
// um banco de verdade depois — só troca o que tem dentro de cada handler.
const DATA_PATH = path.join(process.cwd(), 'src/data/homeSections.json');

const ALLOWED_TYPES = new Set(['banner', 'product']);

// CORS liberado pro admin (porta diferente em dev) poder ler/gravar aqui.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function isValidSections(sections: unknown): sections is Array<{ id: string; type: string }> {
  return (
    Array.isArray(sections) &&
    sections.every(
      (s) => s && typeof s.id === 'string' && ALLOWED_TYPES.has(s.type)
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

  if (!isValidSections(body)) {
    return NextResponse.json(
      { error: 'Formato inválido: esperado um array de sections com id e type reconhecido.' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Grava num arquivo temporário e renomeia por cima do original, pra uma
  // escrita que falhar no meio do caminho não deixar o JSON corrompido.
  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(body, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);

  return NextResponse.json(body, { headers: CORS_HEADERS });
}
