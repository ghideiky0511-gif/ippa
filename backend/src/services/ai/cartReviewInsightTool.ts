import {
  CartReviewFactsSchema,
  CartReviewInsightOutputSchema,
} from '@/contracts/ai';
import {
  CART_REVIEW_INSIGHT_DEFAULT_INSTRUCTIONS,
  CART_REVIEW_INSIGHT_TOOL_KEY,
} from './managedTools';
import { defineAiTool } from './toolDefinition';

export const cartReviewInsightTool = defineAiTool({
  key: CART_REVIEW_INSIGHT_TOOL_KEY,
  version: '1',
  providerProfile: 'cartReviewInsight',
  inputSchema: CartReviewFactsSchema,
  outputSchema: CartReviewInsightOutputSchema,
  instructions: CART_REVIEW_INSIGHT_DEFAULT_INSTRUCTIONS,
  buildPrompt: (input) => [
    'Analise o mix do carrinho atual (já calculado pelo backend) e devolva somente a resposta estruturada solicitada.',
    'O campo text deve conter um único comentário em português do Brasil sobre o carrinho atual, com no máximo 70 palavras e três frases, sem títulos, listas ou saudações.',
    'O campo suggestions deve ter até três sugestões, cada uma em nível de categoria ou grade para completar o pedido — nunca nomes de produto ou SKU específicos, já que você não recebe o catálogo.',
    'Cada sugestão precisa citar a evidência do próprio mix recebido que a sustenta.',
    'Não recalcule nem invente números fora dos recebidos. Use-os como fonte de verdade.',
    'Se a amostra for pequena, sinalize a limitação no texto. Se não houver base para sugestões úteis, devolva suggestions vazio.',
    JSON.stringify(input),
  ].join('\n'),
  maxOutputTokens: 500,
  cacheTtlMs: 2 * 60 * 60 * 1000,
});
