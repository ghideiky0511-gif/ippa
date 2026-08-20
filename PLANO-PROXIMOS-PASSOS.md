# Plano — próximos passos

> Nota de estrutura: código fica em `backend/` (API) e `frontend/` (site
> público + workspace interno em `frontend/src/app/workspace`). As rotas
> antigas `web/`/`admin/` não existem mais. Este documento foi limpo em
> 2026-08-19: tudo que já estava implementado (carrinho, quick-view,
> talão de pedidos, login/cadastro de cliente e vendedora, SSE em tempo
> real, roteamento automático de cliente pra vendedora, cadastro de
> cliente pelo talão, descontos, coleções, editor de home/catálogo,
> preço sugerido + markup, produtos similares, liga/desliga de
> ferramentas) foi removido — só ficou o que falta.

## Pendências reais (verificado contra o código em 2026-08-19)

### Integração ERP / dado real
- **ERP real parcialmente ligado**: existe provider `totvsmoda` de
  verdade (`backend/src/erp/providers/totvsmoda/`, cliente HTTP +
  mapper) ao lado do `mock`, com ativação/teste por tenant
  (`erp-integration/activate|test|deactivate`,
  `backend/src/services/erp/erpSyncService.ts`). Falta confirmar/garantir
  que o catálogo público de cada tenant configurado usa o provider real
  por padrão, não o mock.
- **Pedido não é enviado ao ERP**: `orderService.createCustomerOrder`
  grava só no Postgres (`insertOrderRow`/`insertOrderItemRow`) e dispara
  SSE/notificação — não chama nenhum provider de ERP. Falta decidir e
  implementar esse envio (ex. criação de pedido no TOTVS Moda).

### Frete e pagamento (hoje mock)
- **Frete continua mockado**: `frontend/src/lib/shipping.ts` retorna
  uma lista fixa de opções; CEP não influencia o cálculo. Falta cotação
  real de transportadora.
- **Pagamento continua simulado**: `/pagamento` só grava a forma
  escolhida e fecha o pedido, sem gateway nenhum (Pix/cartão/boleto
  reais). Falta integração de pagamento de verdade.

### Ferramentas do catálogo ainda sem UI
- **Assinatura digital**: nunca foi implementada (nem tipo, nem toggle,
  nem UI) — era pra ser liga/desliga por cliente, não por loja inteira,
  diferente do padrão das outras ferramentas em `/ferramentas`.
- **Data de disponibilidade por variante (`availableFrom`)**: campo
  existe e é editável no workspace, mas não aparece pro cliente final
  (sem exibição/filtro na grade de cor×tamanho da loja).
- **Vídeo por produto na página/quick-view**: `videoUrl` já funciona no
  card da grade (`CatalogProductCard.tsx`), mas falta em
  `produto/[id]/page.tsx` e `ProductQuickView.tsx`.
- **Produtos relacionados ("complete o look")**: `relatedProductIds`
  existe só no tipo — sem UI de edição (workspace) nem de exibição
  (página do produto). Campo declarado e morto.
- **Catálogo dinâmico por regra**: hoje toda curadoria (coleções, ordem
  do catálogo) é lista manual de IDs. Falta um motor de regra
  automática (ex. "tipo de entrega = pré-venda" + "coleção X" atualiza
  sozinho) — é um paradigma novo, não extensão do que existe.

### Multi-tenant
- Multi-tenant funcional hoje é **por path** (`tenantSlug` na URL,
  `backend/src/lib/http/tenantRoute.ts`). Falta (se for necessário)
  resolução por domínio/subdomínio próprio por loja — hoje não existe
  lookup de tenant por `host`.

## Fase 3 — IA (não iniciado)
Geração de imagem↔descrição e montagem de carrinho a partir de texto
livre do WhatsApp — depende do ERP real e do fluxo de pedido→ERP acima
estarem no ar antes de valer a pena investir.

## Estratégia de tempo real — decisão já aplicada
SSE por sessão (não WebSocket) foi a escolha para talão/pedido, e já
está implementado (`backend/src/lib/sseHub.ts`,
`backend/src/realtime/`, `frontend/src/lib/realtime/usePedidoRealtime.ts`).
Ressalva que continua valendo se o Render escalar horizontalmente: o
hub é em memória por processo, cada instância só vê suas próprias
conexões — rodar como instância única resolve por enquanto; se crescer,
precisa de pub/sub compartilhado (Redis ou similar).

**Separação/estoque no depósito** (múltiplas pessoas batendo o mesmo
pedido ao vivo) continua fora de escopo deste catálogo — é produto
complementar (Bippa), não este projeto. Se algum dia entrar aqui, é o
caso que justificaria WebSocket de verdade (bidirecional).

## Fora de escopo por enquanto
- Cobrança real (gateway de pagamento) e cotação real de frete — mock,
  ver acima.
- Separação de pedidos no depósito (escopo do Bippa, produto
  complementar).
- Reenvio/expiração de link de pagamento do talão (hoje um token só
  vale até a sessão fechar).
