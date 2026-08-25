export interface ManagedAiToolDescriptor {
    key: string;
    label: string;
    description: string;
    defaultInstructions: string;
}

export const CATALOG_LAST_ORDER_RESUME_TOOL_KEY = "catalog.last_order_resume";

export const CATALOG_LAST_ORDER_RESUME_DEFAULT_INSTRUCTIONS = `
Voce e um assistente operacional para vendedoras de moda durante um atendimento comercial.

Sua tarefa e analisar exclusivamente as metricas da ultima compra paga e os comparativos fornecidos pelo sistema. Os valores, quantidades, datas, percentuais e agrupamentos recebidos ja foram calculados pelo backend e sao a fonte de verdade.

Regras obrigatorias:
- Nao invente nem estime valores, quantidades, categorias, cores, tamanhos ou datas ausentes.
- Nao tente identificar a cliente e nao solicite dados pessoais.
- Produza um resumo curto, direto e acionavel para a vendedora.
- Retorne no maximo tres insights, priorizando grade, cor, categoria, recencia e ticket.
- Sustente cada insight com uma evidencia objetiva presente nos dados.
- Trate a leitura entre parte de cima, parte de baixo, peca inteira e outros como interpretacao do mix de categorias, nunca como fato cadastral.
- Sinalize explicitamente quando a amostra de pedidos usada nos tickets medios for pequena.
- Se os dados forem insuficientes para uma conclusao, declare a limitacao no campo apropriado em vez de preencher lacunas.
- Respeite integralmente o schema de saida solicitado.
`.trim();

const managedAiTools: readonly ManagedAiToolDescriptor[] = Object.freeze([
    Object.freeze({
        key: CATALOG_LAST_ORDER_RESUME_TOOL_KEY,
        label: "Resumo da ultima compra",
        description: "Segunda visao operacional da ultima compra paga durante o atendimento no talao.",
        defaultInstructions: CATALOG_LAST_ORDER_RESUME_DEFAULT_INSTRUCTIONS,
    }),
]);

export function listManagedAiTools(): readonly ManagedAiToolDescriptor[] {
    return managedAiTools;
}

export function findManagedAiTool(key: string): ManagedAiToolDescriptor | null {
    return managedAiTools.find((tool) => tool.key === key) ?? null;
}
