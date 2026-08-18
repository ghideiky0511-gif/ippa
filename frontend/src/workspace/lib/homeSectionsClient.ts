import type { HomeAiHistoryItem, HomeSection } from '@/domain/catalog/types';
import { adminJson } from './http';

export function fetchHomeSections(): Promise<HomeSection[]> {
  return adminJson('/api/home-sections', {}, 'Não foi possível carregar a home atual.');
}

export function saveHomeSections(sections: HomeSection[]): Promise<HomeSection[]> {
  return adminJson('/api/home-sections', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sections),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
}

export async function generateHomeSections(prompt: string, currentSections: HomeSection[]): Promise<HomeSection[]> {
  const result = await adminJson<{ sections: HomeSection[] }>('/api/admin/home-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, currentSections }),
  }, 'Não foi possível gerar a estrutura.');
  return result.sections;
}

export async function fetchHomeAiHistory(): Promise<HomeAiHistoryItem[]> {
  const result = await adminJson<{ history?: HomeAiHistoryItem[] }>('/api/admin/home-ai/history', {}, 'Não foi possível carregar o histórico.');
  return result.history ?? [];
}
