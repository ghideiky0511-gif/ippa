import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Client } from './types';

// Cadastro de cliente (ver Client em types.ts) — arquivo hoje, mesmo padrão
// de orderSessions.ts/highlights: banco de verdade depois só troca o que
// tem dentro dessas duas funções. isClientComplete mora em clientComplete.ts
// (mesmo motivo do comentário lá): função pura, sem node:fs, pra dar pra
// importar de componente client também.
const DATA_PATH = path.join(process.cwd(), 'src/data/clients.json');

export async function readClients(): Promise<Client[]> {
  const raw = await readFile(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

export async function writeClients(clients: Client[]): Promise<void> {
  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(clients, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);
}
