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
  version: '2',
  providerProfile: 'catalogOrderResume',
  inputSchema: CatalogLastOrderResumeInputSchema,
  outputSchema: CatalogLastOrderResumeOutputSchema,
  instructions: CATALOG_LAST_ORDER_RESUME_DEFAULT_INSTRUCTIONS,
  buildPrompt: (input) => [
    'Analise os dados operacionais abaixo e devolva somente a resposta estruturada solicitada.',
    'O campo text deve conter um único resumo operacional em português do Brasil, com no máximo 70 palavras e três frases.',
    'Priorize o padrão mais útil de grade, cor ou categoria; compare ticket apenas quando a amostra permitir; encerre com uma ação comercial concreta.',
    'Não use títulos, listas, markdown, saudações nem repita todos os KPIs. Se faltarem itens, explique a limitação de forma direta.',
    'Não recalcule nem corrija os fatos recebidos. Use-os como fonte de verdade.',
    JSON.stringify(input),
  ].join('\n'),
  maxOutputTokens: 350,
  cacheTtlMs: 24 * 60 * 60 * 1000,
});
