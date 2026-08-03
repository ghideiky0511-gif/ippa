# Plano — parte do cliente do catálogo

## O que já existe (feito nesta rodada)

- Carrinho e "adicionar ao carrinho" saíram da página inicial. A grade (o card na
  listagem) agora só mostra imagem, nome, preço e as cores disponíveis como
  bolinhas — nada de escolher tamanho/cor ali.
- Botão **+** no canto inferior direito de cada card abre um painel lateral
  (quick-view, anima da direita pra esquerda) com: descrição, todas as cores
  (disponíveis e indisponíveis, indisponíveis riscadas), grade de tamanhos da cor
  selecionada, tipo de entrega da combinação escolhida, e o botão de adicionar ao
  carrinho — só ele adiciona.
- Página própria de produto em `/produto/[id]` com o mesmo conteúdo do quick-view,
  em layout de página cheia (útil pra compartilhar link, abrir em nova aba, SEO).
- Carrinho passou a ser global (Context + localStorage), então sobrevive a
  navegação entre catálogo → produto → pedidos, e a um F5.
- Página `/pedidos` ("Meus pedidos") lista o histórico de pedidos enviados por
  este navegador via WhatsApp (salvo em localStorage no momento do checkout).
- Protótipo estático da raiz (`index.html`, `catalog.json`) removido — só existe
  a versão Next.js em `web/` daqui pra frente.

## Limitação importante do "Meus pedidos" atual

Hoje um "pedido" é só um registro local no navegador, criado quando o botão do
WhatsApp é clicado — não existe confirmação de recebimento, status, nem qualquer
coisa do lado do servidor. Isso é suficiente pra MVP/demo, mas **não substitui**
um sistema de pedidos real. Ele deve virar a tela que consome pedidos de verdade
assim que a Fase 2 (Bippa/ERP) existir.

## Próximos passos sugeridos (em ordem)

1. **Fase 2 — dado e pedido reais**
   - Trocar `catalog.json` por uma chamada real ao ERP/Bippa dentro de
     `/api/catalog` (a rota já existe como esse ponto de troca).
   - Criar `POST /api/pedidos` que registra o pedido no Bippa/ERP de verdade; a
     tela `/pedidos` passa a consultar esse endpoint por cliente (precisa de
     login/identificação do cliente, que ainda não existe).
   - Nesse momento, decidir se o checkout continua indo pro WhatsApp, vira
     confirmação direta no site, ou os dois.

2. **Identificação do cliente**
   - `/pedidos` hoje é "por navegador" (qualquer um que abrir o site vê só os
     pedidos feitos ali). Pra ser "meus pedidos" de verdade, precisa de login
     (telefone/WhatsApp costuma ser o mais natural pro público desse catálogo)
     ou pelo menos um identificador persistente por cliente vindo do Bippa.

3. **"Produtos similares"**
   - Já dá pra fazer com o que existe: mesma `category`/`subcategory`, excluindo
     o próprio produto — mostrar isso na página `/produto/[id]` abaixo da grade.
     Não depende de mais nada, pode entrar antes da Fase 2.

4. **Status de entrega variante a variante**
   - O feed atual só traz `in_stock`, então hoje toda variante aparece como
     "Pronta entrega". O código já suporta `preorder`/`backorder` →
     "Pré-venda" e `out_of_stock` → "Esgotado" (`web/src/lib/variants.js`); falta
     o Bippa/ERP realmente mandar esses valores pra isso aparecer na prática.

5. **Fase 3 — IA**
   - Geração de imagem↔descrição e montagem de carrinho a partir de texto livre
     do WhatsApp, como discutido — depende dos dados reais (Fase 2) estarem no
     ar antes de valer a pena investir nisso.

## Sobre a ideia de WebSocket para eventos do carrinho

Hoje cada + / − na grade já atualiza o carrinho na hora (estado em memória +
localStorage), e como é tudo dentro da mesma aba/navegador isso já é "tempo
real" o suficiente — não tem um segundo dispositivo ou pessoa pra sincronizar
com. WebSocket só compensa quando existe alguém do outro lado ouvindo em tempo
real: por exemplo, a vendedora montando o carrinho num tablet enquanto a
cliente acompanha pelo celular, ou o estoque do Bippa avisando "essa cor
acabou" no meio da navegação. Isso depende de ter um backend (Fase 2) — não faz
sentido montar um servidor de WebSocket só pra sincronizar uma aba com ela
mesma. As mudanças de carrinho já passam todas por um único lugar
(`CartProvider`), então quando a Fase 2 existir, plugar um broadcaster ali é
uma mudança pequena, não um retrabalho.

## Fora de escopo por enquanto

- Pagamento/checkout dentro do site (segue via WhatsApp).
- Separação de pedidos (isso é o Bippa, produto complementar).
- Multi-loja / múltiplas marcas no mesmo catálogo.
