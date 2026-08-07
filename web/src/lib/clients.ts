import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Client } from './types';

// Cadastro de cliente (ver Client em types.ts) — arquivo hoje, mesmo padrão
// de orderSessions.ts/highlights: banco de verdade depois só troca o que
// tem dentro dessas duas funções.
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

// "Completo" = o mínimo pra fechar um pedido de verdade (fluxo de frete) —
// combinado com o usuário: CPF/CNPJ, nome, email e CEP. Uma sessão pode
// existir e ter itens adicionados sem isso (a vendedora monta o carrinho
// livre), só não pode avançar pro frete sem completar.
export function isClientComplete(client: Pick<Client, 'name' | 'cpfCnpj' | 'email' | 'cep'>): boolean {
  return Boolean(client.name?.trim() && client.cpfCnpj?.trim() && client.email?.trim() && client.cep?.trim());
}
