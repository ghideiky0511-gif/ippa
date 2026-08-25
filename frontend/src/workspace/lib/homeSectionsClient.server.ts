import { z } from 'zod';
import { HomeSectionSchema, type HomeSection } from '@/domain/catalog/types';
import { adminJsonServer } from './httpServer';

export function fetchHomeSections(): Promise<HomeSection[]> {
  return adminJsonServer('/api/home-sections', z.array(HomeSectionSchema), {}, 'Não foi possível carregar a home atual.');
}
