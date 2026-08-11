import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { AssignmentStrategy } from './assignment';

// Configurações da loja que não são por produto (ver GET/PUT
// /api/store-settings, editável em /ferramentas e /produtos no admin) —
// arquivo hoje, mesmo padrão de clients.ts/orderSessions.ts. Centralizado
// aqui porque mais de uma rota precisa ler o mesmo arquivo (signup, link de
// pagamento, checagem de expiração), não só a própria API de settings.
const DATA_PATH = path.join(process.cwd(), 'src/data/storeSettings.json');

export interface StoreSettings {
  defaultMarkup?: number;
  features?: Record<string, boolean>;
  assignmentStrategy?: AssignmentStrategy;
  // Prazo (minutos) até o link de pagamento do talão expirar — ver
  // POST /api/sessions/[id]/payment-link e GET/POST /api/pay/[token].
  // Sem valor = usa PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES abaixo.
  paymentLinkExpirationMinutes?: number;
}

export const PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES = 15;

export async function readStoreSettings(): Promise<StoreSettings> {
  const raw = await readFile(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

export async function writeStoreSettings(settings: StoreSettings): Promise<void> {
  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(settings, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);
}
