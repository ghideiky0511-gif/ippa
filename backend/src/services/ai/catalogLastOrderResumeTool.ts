import {
  CatalogLastOrderResumeInputSchema,
  CatalogLastOrderResumeOutputSchema,
} from '@/contracts/ai';
import {
  CATALOG_LAST_ORDER_RESUME_DEFAULT_INSTRUCTIONS,
  CATALOG_LAST_ORDER_RESUME_TOOL_KEY,
} from './managedTools';
import { defineAiTool } from './toolDefinition';

export const catalogLastOrderResumeTool = defineAiTool({
  key: CATALOG_LAST_ORDER_RESUME_TOOL_KEY,
  version: '1',
  providerProfile: 'catalogOrderResume',
  inputSchema: CatalogLastOrderResumeInputSchema,
  outputSchema: CatalogLastOrderResumeOutputSchema,
  instructions: CATALOG_LAST_ORDER_RESUME_DEFAULT_INSTRUCTIONS,
  buildPrompt: (input) => [
    'Analise os dados operacionais abaixo e devolva somente a resposta estruturada solicitada.',
    'Não recalcule nem corrija os fatos recebidos. Use-os como fonte de verdade.',
    JSON.stringify(input),
  ].join('\n'),
  maxOutputTokens: 900,
  cacheTtlMs: 24 * 60 * 60 * 1000,
});
