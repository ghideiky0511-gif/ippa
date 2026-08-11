import { NextRequest, NextResponse } from 'next/server';
import { readStoreSettings, writeStoreSettings, type StoreSettings } from '@/lib/storeSettings';

// Configurações da loja que não são por produto: markup sugerido padrão
// (aplicado a toda peça sem preço sugerido/markup próprio, ver
// applyDefaultMarkup em web/src/lib/catalog.ts), o liga/desliga de
// ferramentas opcionais do catálogo (`features`, ver stripDisabledFeatures
// no mesmo arquivo — cada chave é o id de uma ferramenta, ex.
// "suggestedPrice"), a estratégia de distribuição de cliente nova no
// talão (`assignmentStrategy`, ver pickSeller em web/src/lib/assignment.ts)
// e o prazo do link de pagamento (`paymentLinkExpirationMinutes`, ver
// web/src/lib/storeSettings.ts — mesmo arquivo, tipo e leitura/escrita
// centralizados lá porque outras rotas além desta também precisam ler).
// Editável pela plataforma admin em /produtos (markup padrão) e
// /ferramentas (liga/desliga, distribuição, expiração do link). Mesmo
// padrão do /api/highlights: arquivo hoje, GET/PUT aqui, banco de verdade
// depois só troca o que tem dentro de cada handler.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ASSIGNMENT_STRATEGIES = new Set(['leastBusy', 'roundRobin', 'any']);

function isValidSettings(value: unknown): value is StoreSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { defaultMarkup, features, assignmentStrategy, paymentLinkExpirationMinutes } = value as StoreSettings;
  const validDefaultMarkup = defaultMarkup === undefined || (typeof defaultMarkup === 'number' && defaultMarkup > 0);
  const validFeatures =
    features === undefined ||
    (typeof features === 'object' && !Array.isArray(features) && Object.values(features).every((v) => typeof v === 'boolean'));
  const validAssignmentStrategy = assignmentStrategy === undefined || ASSIGNMENT_STRATEGIES.has(assignmentStrategy);
  const validExpiration =
    paymentLinkExpirationMinutes === undefined ||
    (typeof paymentLinkExpirationMinutes === 'number' && paymentLinkExpirationMinutes > 0);
  return validDefaultMarkup && validFeatures && validAssignmentStrategy && validExpiration;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const settings = await readStoreSettings();
  return NextResponse.json(settings, { headers: CORS_HEADERS });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  if (!isValidSettings(body)) {
    return NextResponse.json(
      {
        error:
          'Formato inválido: esperado { defaultMarkup?: number, features?: { [id]: boolean }, assignmentStrategy?: "leastBusy"|"roundRobin"|"any", paymentLinkExpirationMinutes?: number }.',
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  await writeStoreSettings(body);

  return NextResponse.json(body, { headers: CORS_HEADERS });
}
