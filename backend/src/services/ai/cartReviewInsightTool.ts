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
  version: '3',
  providerProfile: 'cartReviewInsight',
  inputSchema: CartReviewFactsSchema,
  outputSchema: CartReviewInsightOutputSchema,
  instructions: CART_REVIEW_INSIGHT_DEFAULT_INSTRUCTIONS,
  buildPrompt: (input) => [
    'Analise o mix do carrinho atual (já calculado pelo backend) e devolva somente a resposta estruturada solicitada, em português do Brasil.',
    'O campo headline deve ter uma única frase curta (até 20 palavras) resumindo o carrinho, sem saudação.',
    'O campo highlights deve ter até cinco tópicos curtos (uma linha cada, sem numeração própria nem introdução), destacando fatos do mix recebido (categoria, tamanho, cor).',
    'O campo suggestions deve ter até três sugestões, cada uma em nível de categoria ou grade para completar o pedido — nunca nomes de produto ou SKU específicos, já que você não recebe o catálogo.',
    'Quando a sugestão apontar pra completar com uma categoria específica, preencha suggestions[].category repetindo exatamente o rótulo recebido em mix.categories ou mix.subcategories. Caso contrário, use null — o campo é obrigatório em todo item, nunca omita a chave.',
    'Cada sugestão precisa citar a evidência do próprio mix recebido que a sustenta.',
    'Não recalcule nem invente números fora dos recebidos. Use-os como fonte de verdade.',
    'Se a amostra for pequena, sinalize a limitação em um highlight. Se não houver base para sugestões úteis, devolva suggestions vazio.',
    JSON.stringify(input),
  ].join('\n'),
  // headline + até 5 highlights + até 3 suggestions (4 campos cada) já soma
  // ~2300 caracteres no pior caso, fora overhead de JSON estruturado e
  // tokens de raciocínio de modelos que gastam isso do próprio orçamento de
  // saída — 600 vinha cortando a resposta no meio (status "incomplete").
  maxOutputTokens: 2000,
  cacheTtlMs: 2 * 60 * 60 * 1000,
});
