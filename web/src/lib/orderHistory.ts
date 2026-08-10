import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Order } from './types';

// Histórico de pedidos gravado no SERVIDOR, por conta (Order.clientId/
// sellerId) — diferente de readOrders() em CartProvider.tsx, que é o
// histórico antigo por navegador (localStorage), mantido só pra quem não
// está logada (ver saveOrderToHistory). Mesmo padrão atomic-write de
// orderSessions.ts.
const DATA_PATH = path.join(process.cwd(), 'src/data/orderHistory.json');

export async function readOrderHistory(): Promise<Order[]> {
  const raw = await readFile(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

export async function writeOrderHistory(orders: Order[]): Promise<void> {
  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(orders, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);
}
