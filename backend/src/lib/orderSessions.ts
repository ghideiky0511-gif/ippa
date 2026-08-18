import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { OrderSession } from './types';

// Talões (pedidos em andamento por cliente, ver OrderSession em types.ts).
// Arquivo hoje, mesmo padrão de highlights/homeSections — banco de verdade
// depois só troca o que tem dentro dessas duas funções.
const DATA_PATH = path.join(process.cwd(), 'src/data/orderSessions.json');

export async function readOrderSessions(): Promise<OrderSession[]> {
  const raw = await readFile(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

export async function writeOrderSessions(sessions: OrderSession[]): Promise<void> {
  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(sessions, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);
}

// Quantos talões abertos cada vendedora tem agora — insumo da estratégia
// "menos pedidos abertos" em web/src/lib/assignment.ts (pickSeller).
export async function countOpenSessionsBySeller(): Promise<Record<string, number>> {
  const sessions = await readOrderSessions();
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    if (s.status === 'aberto') counts[s.sellerId] = (counts[s.sellerId] || 0) + 1;
  }
  return counts;
}
