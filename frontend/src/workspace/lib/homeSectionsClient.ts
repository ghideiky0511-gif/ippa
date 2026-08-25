import { z } from 'zod';
import { HomeAiHistoryItemSchema, HomeSectionSchema, type HomeAiHistoryItem, type HomeSection } from '@/domain/catalog/types';
import { adminJson } from './http';

export function saveHomeSections(sections: HomeSection[]): Promise<HomeSection[]> {
  return adminJson('/api/home-sections', z.array(HomeSectionSchema), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sections),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
}

const GenerateHomeSectionsResultSchema = z.object({ sections: z.array(HomeSectionSchema) });

export async function generateHomeSections(prompt: string, currentSections: HomeSection[]): Promise<HomeSection[]> {
  const result = await adminJson('/api/admin/home-ai', GenerateHomeSectionsResultSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, currentSections }),
  }, 'Não foi possível gerar a estrutura.');
  return result.sections;
}

const HomeAiHistoryResultSchema = z.object({ history: z.array(HomeAiHistoryItemSchema).optional() });

export async function fetchHomeAiHistory(): Promise<HomeAiHistoryItem[]> {
  const result = await adminJson('/api/admin/home-ai/history', HomeAiHistoryResultSchema, {}, 'Não foi possível carregar o histórico.');
  return result.history ?? [];
}
