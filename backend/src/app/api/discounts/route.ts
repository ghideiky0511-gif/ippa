import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// Regras de desconto cadastradas pela loja, editáveis pela plataforma admin
// em /descontos. Mesmo padrão do /api/highlights: arquivo hoje, GET/PUT
// aqui, banco de verdade depois só troca o que tem dentro de cada handler.
// Cadastro apenas — ver Discount em web/src/lib/types.ts: ainda não é
// aplicado no cálculo do carrinho/checkout (fica pra um próximo passo,
// documentado em PLANO-PROXIMOS-PASSOS.md).
const DATA_PATH = path.join(process.cwd(), 'src/data/discounts.json');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3000',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface DiscountTier {
  minQty: number;
  percent: number;
}

interface Discount {
  id: string;
  label: string;
  active: boolean;
  type: 'quantity' | 'products';
  tiers: DiscountTier[];
  productIds: string[];
  percent: number;
}

function isValidTier(value: unknown): value is DiscountTier {
  if (!value || typeof value !== 'object') return false;
  const { minQty, percent } = value as DiscountTier;
  return typeof minQty === 'number' && minQty >= 0 && typeof percent === 'number' && percent >= 0;
}

function isValidDiscount(value: unknown): value is Discount {
  if (!value || typeof value !== 'object') return false;
  const d = value as Discount;
  return (
    typeof d.id === 'string' &&
    typeof d.label === 'string' &&
    typeof d.active === 'boolean' &&
    (d.type === 'quantity' || d.type === 'products') &&
    Array.isArray(d.tiers) &&
    d.tiers.every(isValidTier) &&
    Array.isArray(d.productIds) &&
    d.productIds.every((id) => typeof id === 'string') &&
    typeof d.percent === 'number'
  );
}

function isValidDiscounts(value: unknown): value is Discount[] {
  return Array.isArray(value) && value.every(isValidDiscount);
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

  if (!isValidDiscounts(body)) {
    return NextResponse.json(
      {
        error:
          'Formato inválido: esperado um array de descontos com id, label, active, type ("quantity"|"products"), tiers, productIds e percent.',
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(body, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);

  return NextResponse.json(body, { headers: CORS_HEADERS });
}
