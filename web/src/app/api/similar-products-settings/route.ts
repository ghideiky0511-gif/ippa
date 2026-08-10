import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// Configuração da regra de "produtos similares" (quick-view/página de
// produto e carrinho, ver web/src/lib/similarProducts.ts) — editável pela
// plataforma admin em /ferramentas (GET/PUT aqui). Mesmo padrão do
// /api/store-settings: arquivo hoje, GET/PUT aqui, banco de verdade depois
// só troca o que tem dentro de cada handler.
const DATA_PATH = path.join(process.cwd(), 'src/data/similarProductsSettings.json');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type RuleConfig = { limit: number; rules: string[] };

type SimilarProductsSettings = {
  quickview: RuleConfig;
  cart: RuleConfig;
  complementaryCategories: Record<string, string[]>;
};

function isValidRuleConfig(value: unknown): value is RuleConfig {
  if (!value || typeof value !== 'object') return false;
  const { limit, rules } = value as RuleConfig;
  return (
    typeof limit === 'number' &&
    limit > 0 &&
    Array.isArray(rules) &&
    rules.every((r) => typeof r === 'string')
  );
}

function isValidComplementaryCategories(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (v) => Array.isArray(v) && v.every((c) => typeof c === 'string')
  );
}

function isValidSettings(value: unknown): value is SimilarProductsSettings {
  if (!value || typeof value !== 'object') return false;
  const { quickview, cart, complementaryCategories } = value as SimilarProductsSettings;
  return (
    isValidRuleConfig(quickview) &&
    isValidRuleConfig(cart) &&
    isValidComplementaryCategories(complementaryCategories)
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

  if (!isValidSettings(body)) {
    return NextResponse.json(
      {
        error:
          'Formato inválido: esperado { quickview: {limit, rules}, cart: {limit, rules}, complementaryCategories: {[categoria]: string[]} }.',
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(body, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);

  return NextResponse.json(body, { headers: CORS_HEADERS });
}
