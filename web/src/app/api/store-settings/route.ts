import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// Configurações da loja que não são por produto: markup sugerido padrão
// (aplicado a toda peça sem preço sugerido/markup próprio, ver
// applyDefaultMarkup em web/src/lib/catalog.ts), o liga/desliga de
// ferramentas opcionais do catálogo (`features`, ver stripDisabledFeatures
// no mesmo arquivo — cada chave é o id de uma ferramenta, ex.
// "suggestedPrice") e a estratégia de distribuição de cliente nova no
// talão (`assignmentStrategy`, ver pickSeller em
// web/src/lib/assignment.ts — combinado com o usuário: cada loja escolhe a
// sua). Editável pela plataforma admin em /produtos (markup padrão) e
// /ferramentas (liga/desliga, distribuição). Mesmo padrão do
// /api/highlights: arquivo hoje, GET/PUT aqui, banco de verdade depois só
// troca o que tem dentro de cada handler.
const DATA_PATH = path.join(process.cwd(), 'src/data/storeSettings.json');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ASSIGNMENT_STRATEGIES = new Set(['leastBusy', 'roundRobin', 'any']);

type StoreSettings = {
  defaultMarkup?: number;
  features?: Record<string, boolean>;
  assignmentStrategy?: 'leastBusy' | 'roundRobin' | 'any';
};

function isValidSettings(value: unknown): value is StoreSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { defaultMarkup, features, assignmentStrategy } = value as StoreSettings;
  const validDefaultMarkup = defaultMarkup === undefined || (typeof defaultMarkup === 'number' && defaultMarkup > 0);
  const validFeatures =
    features === undefined ||
    (typeof features === 'object' && !Array.isArray(features) && Object.values(features).every((v) => typeof v === 'boolean'));
  const validAssignmentStrategy = assignmentStrategy === undefined || ASSIGNMENT_STRATEGIES.has(assignmentStrategy);
  return validDefaultMarkup && validFeatures && validAssignmentStrategy;
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

  if (!isValidSettings(body)) {
    return NextResponse.json(
      {
        error:
          'Formato inválido: esperado { defaultMarkup?: number, features?: { [id]: boolean }, assignmentStrategy?: "leastBusy"|"roundRobin"|"any" }.',
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(body, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);

  return NextResponse.json(body, { headers: CORS_HEADERS });
}
