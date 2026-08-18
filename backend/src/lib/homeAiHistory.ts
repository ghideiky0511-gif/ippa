import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { HomeSection } from './types';

// Log de cada geração feita em POST /api/admin/home-ai — pra alimentar o
// botão "Histórico" no admin (ver AiHistoryPanel em BuilderApp.js): revisar
// o que já foi pedido antes e reaplicar um resultado anterior sem precisar
// chamar a IA de novo. `sections` guarda o resultado JÁ validado (mesmo
// formato que o POST devolve), pronto pra jogar direto no canvas.
const DATA_PATH = path.join(process.cwd(), 'src/data/homeAiHistory.json');
const MAX_ENTRIES = 50;

export interface HomeAiHistoryEntry {
  id: string;
  prompt: string;
  at: string;
  sections: HomeSection[];
}

export async function listHomeAiHistory(): Promise<HomeAiHistoryEntry[]> {
  const raw = await readFile(DATA_PATH, 'utf-8').catch(() => '[]');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendHomeAiHistory(entry: HomeAiHistoryEntry): Promise<void> {
  const current = await listHomeAiHistory();
  const next = [entry, ...current].slice(0, MAX_ENTRIES);
  const tmpPath = `${DATA_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(next, null, 2), 'utf-8');
  await rename(tmpPath, DATA_PATH);
}
