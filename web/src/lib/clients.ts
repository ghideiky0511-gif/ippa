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

// Exclui um cadastro — usado quando a conta de login vinculada é apagada
// pelo admin (ver deleteUser em web/src/lib/auth.ts e DELETE
// /api/admin/users/[id]), pra não sobrar um Client órfão sem login nenhum
// apontando pra ele.
export async function deleteClient(id: string): Promise<void> {
  const clients = await readClients();
  await writeClients(clients.filter((c) => c.id !== id));
}

// Acha um cadastro já existente com o mesmo CPF/CNPJ (compara só dígitos,
// ignora formatação — mesmo padrão frouxo de getDocumentType em
// web/src/lib/document.ts). Usado pra bloquear duplicata em POST /api/clients
// e POST /api/auth/signup: um mesmo documento não deve virar dois Client.
export function findClientByDocument(clients: Client[], cpfCnpj: string): Client | undefined {
  const digits = cpfCnpj.replace(/\D/g, '');
  if (!digits) return undefined;
  return clients.find((c) => c.cpfCnpj && c.cpfCnpj.replace(/\D/g, '') === digits);
}
