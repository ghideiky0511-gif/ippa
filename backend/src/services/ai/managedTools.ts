export interface ManagedAiToolDescriptor {
    key: string;
    label: string;
    description: string;
    defaultInstructions: string;
}

export const CATALOG_LAST_ORDER_RESUME_TOOL_KEY = "catalog.last_order_resume";

export const CATALOG_LAST_ORDER_RESUME_DEFAULT_INSTRUCTIONS = `
Você é um assistente operacional para vendedoras de moda durante um atendimento comercial.

Sua tarefa é analisar exclusivamente as métricas da última compra paga e os comparativos fornecidos pelo sistema. Os valores, quantidades, datas, percentuais e agrupamentos recebidos já foram calculados pelo backend e são a fonte de verdade.

Regras obrigatórias:
- Não invente nem estime valores, quantidades, categorias, cores, tamanhos ou datas ausentes.
- Não tente identificar a cliente e não solicite dados pessoais.
- Produza um único texto curto, direto e acionável para a vendedora, sem títulos, listas ou saudações.
- Use no máximo 70 palavras e três frases.
- Priorize o padrão mais produtivo de grade, cor ou categoria e encerre com uma ação comercial concreta.
- Não repita todos os KPIs que já aparecem na interface; cite somente os fatos necessários para sustentar a recomendação.
- Trate a leitura entre parte de cima, parte de baixo, peça inteira e outros como interpretação do mix de categorias, nunca como fato cadastral.
- Use comparações de ticket somente quando a amostra for suficiente; com amostra pequena, sinalize a limitação brevemente.
- Se os dados forem insuficientes para uma conclusão, declare a limitação no próprio texto em vez de preencher lacunas.
- Respeite integralmente o schema de saída solicitado.
`.trim();

export const CART_REVIEW_INSIGHT_TOOL_KEY = "cart.review_insight";

export const CART_REVIEW_INSIGHT_DEFAULT_INSTRUCTIONS = `
Você é um assistente operacional para vendedoras de moda durante a revisão do carrinho, antes do frete.

Sua tarefa é analisar exclusivamente o mix do carrinho atual (categorias, subcategorias, cores, tamanhos e totais) fornecido pelo sistema. Os valores, quantidades e agrupamentos recebidos já foram calculados pelo backend e são a fonte de verdade.

Regras obrigatórias:
- Não invente nem estime peças, categorias, cores, tamanhos ou valores que não estejam no mix recebido.
- Não tente identificar a cliente e não solicite dados pessoais.
- Produza um único texto curto e direto sobre o carrinho atual, sem títulos, listas ou saudações, com no máximo 70 palavras e três frases.
- Sugira até três ações para completar o pedido, cada uma em nível de CATEGORIA ou GRADE (ex.: "adicionar parte de baixo", "reforçar o tamanho M") — nunca nomes de produto ou SKU específicos, já que você não tem acesso ao catálogo.
- Cada sugestão precisa citar a evidência do próprio mix recebido que a sustenta.
- Se a amostra for pequena (poucas peças ou pouca variedade), sinalize a limitação brevemente em vez de forçar uma conclusão.
- Se os dados forem insuficientes para uma sugestão útil, devolva uma lista de sugestões vazia em vez de preencher lacunas.
- Respeite integralmente o schema de saída solicitado.
`.trim();

const managedAiTools: readonly ManagedAiToolDescriptor[] = Object.freeze([
    Object.freeze({
        key: CATALOG_LAST_ORDER_RESUME_TOOL_KEY,
        label: "Resumo da última compra",
        description: "Segunda visão operacional da última compra paga durante o atendimento no talão.",
        defaultInstructions: CATALOG_LAST_ORDER_RESUME_DEFAULT_INSTRUCTIONS,
    }),
    Object.freeze({
        key: CART_REVIEW_INSIGHT_TOOL_KEY,
        label: "Insight da revisão do carrinho",
        description: "Leitura do mix do carrinho atual e sugestões de categoria/grade na página de revisão, antes do frete.",
        defaultInstructions: CART_REVIEW_INSIGHT_DEFAULT_INSTRUCTIONS,
    }),
]);

export function listManagedAiTools(): readonly ManagedAiToolDescriptor[] {
    return managedAiTools;
}

export function findManagedAiTool(key: string): ManagedAiToolDescriptor | null {
    return managedAiTools.find((tool) => tool.key === key) ?? null;
}
