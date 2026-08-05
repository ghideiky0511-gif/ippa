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
- Fluxo alternativo de checkout pelo próprio site: `/carrinho` (confirmação,
  com o botão do WhatsApp continuando disponível) → `/frete` (mock, lista fixa
  em `web/src/lib/shipping.js`, CEP não influencia o cálculo ainda) →
  `/pagamento` (escolha de Pix/Cartão/Boleto, sem coletar dado de cartão de
  verdade — é só simulação) → `/pedido-confirmado`. O WhatsApp continua sendo
  o caminho mais rápido e não foi alterado; este é um segundo caminho pro
  cliente que preferir fechar direto no site. Pedidos feitos por aqui aparecem
  em "Meus pedidos" com badge "via site" e mostram frete/forma de pagamento
  escolhidos.
- Home de vitrine separada da busca: `/` agora é uma home própria (carrossel
  de banners/vídeo e produtos em destaque); a grade completa com filtros
  virou `/catalogo`. Conteúdo da home (banners, destaques) mora em
  `CONFIG.home` (`web/src/lib/config.js`), curadoria manual por enquanto.
- Menu lateral global (hamburguer, disponível em toda página): busca com
  sugestão ao vivo por prefixo do nome (`web/src/lib/search.js`, hoje ordem
  arbitrária, pronta pra virar ranking por popularidade), destaques de
  coleção (`CONFIG.home.highlights`, ex. "Verão 2027") e públicos
  (`CONFIG.home.audiences`, ex. "Moda teen") — cada público abre um segundo
  painel com as categorias filtradas por ele. Destaques/públicos são listas
  de IDs de produto (tag), separadas da taxonomia categoria/subcategoria da
  peça, porque são agrupamentos que se sobrepõem (uma peça pode estar em
  vários ao mesmo tempo). Categoria/subcategoria continua sendo a
  classificação física da peça (um valor só, hierárquica). Logo da loja
  centralizado no topo.
- Primeira fatia da plataforma admin (`admin/`, app Next.js à parte, porta
  3001 em dev): editor visual da home com blocos arrastáveis (banner
  foto/vídeo, produto), canvas de posição livre (x/y/largura/altura, nada
  se move sozinho) — ver seção abaixo. `CONFIG.home.sections` saiu de
  `web/src/lib/config.js` e virou `web/src/data/homeSections.json`, servido
  por `GET/PUT /api/home-sections`; `web/src/app/page.tsx` lê esse arquivo
  em tempo de request (`dynamic = 'force-dynamic'`), então uma edição salva
  no admin aparece no catálogo sem rebuild. Ainda sem login no admin — ver
  limitações abaixo.
- Segunda fatia do admin: `/colecoes` — coleções nomeadas de produtos (ex.
  "Verão 2027", mostradas no menu lateral), com reordenação por
  arrastar-e-soltar dentro da coleção (dnd-kit sortable simples, não o
  canvas livre da home). Mesma migração de padrão: `CONFIG.home.highlights`
  saiu de `config.ts` e virou `web/src/data/highlights.json` +
  `GET/PUT /api/highlights`. Cada coleção tem link público compartilhável
  (`/catalogo?destaque=<id>`, botão de WhatsApp) e exportação em PDF
  (`/catalogo/pdf?destaque=<id>`, via impressão do navegador — "Salvar como
  PDF", sem biblioteca nova). Inspirado no produto Colab da Teceo
  (digitalização de showroom atacadista).

## Sobre personalização por cliente / multi-tenant

O pedido de fundo é cada cliente ter sua própria identidade (cores, logo,
banners, destaques) e, mais à frente, multi-tenant de verdade — um app só
servindo vários clientes, com conta de loja (CRUD de peças/layout) e sugestão
de destaques por analytics de venda. Combinado com o usuário: **isso é um
projeto à parte**, porque depende de decisões de infraestrutura que não
existem hoje (banco de dados, autenticação de loja x cliente, hospedagem
multi-tenant) — não dá pra encaixar de raspão numa tarefa de UI. O que foi
feito agora é a base que deixa esse caminho mais curto depois:

- Todo o conteúdo "deste cliente" (nome, logo, WhatsApp, banners, produtos em
  destaque) já mora num lugar só (`CONFIG` em `web/src/lib/config.js`), do
  mesmo jeito que `/api/catalog` já é o ponto de troca pro dado do Bippa/ERP.
- Curadoria de destaque é manual hoje (`CONFIG.home.featuredProductIds`), mas
  já pensada pra virar sugestão por analytics de venda quando existir conta de
  loja — trocar a fonte dessa lista não exige mexer no componente que
  consome (`HomeApp`/`ProductCard`).
- Quando o multi-tenant real for planejado, os pontos que precisam de decisão
  são: banco de dados (guardar config + catálogo por cliente), autenticação
  (cliente comprador x conta de loja com permissão de editar layout/cadastrar
  peça) e como resolver "qual cliente é esse" por request (domínio/subdomínio
  vs. login). Vale um plano próprio quando for a hora.
- Primeira fatia disso já começou: o editor visual da home (`admin/`, ver
  acima) — mas ainda sem as três decisões de infra acima (login, banco,
  "qual loja é essa"), só o `JSON` + API que já existiam. Persistência hoje é
  um arquivo (`homeSections.json`), sem histórico — trocar por versionamento
  (salvar cada alteração com timestamp, permitir reverter pra uma anterior)
  é extensão natural da mesma API, sem precisar de banco novo nem de
  WebSocket, e fica pra quando o editor tiver mais uso de verdade.

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
   - Trocar `calculateShipping` (`web/src/lib/shipping.js`) por uma cotação real
     de transportadora, e a seleção de pagamento em `/pagamento` por uma
     integração de verdade (Pix/cartão/boleto via um gateway) — hoje os dois
     são só mock de interface, sem cobrança nem frete reais.
   - O WhatsApp e o checkout pelo site já convivem hoje (o cliente escolhe);
     não é preciso decidir entre os dois, só amadurecer o segundo quando a
     Fase 2 chegar.

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

## Estratégia de tempo real (WebSocket/SSE) — preparada pra Fase 2

Decisão (sem implementar ainda — só o racional registrado pra quando a Fase 2
existir e valer a pena voltar aqui):

- **Editor da home (`admin/`) não usa WebSocket.** É uma ação deliberada do
  adm (arrastar, editar, conferir, só então clicar Salvar) — não tem "outro
  lado" esperando um evento ao vivo. Fica como está: confirmar e salvar via
  API (`PUT /api/home-sections`), com o versionamento descrito acima como
  próximo passo, não tempo real.
- **Carrinho**: hoje cada + / − já atualiza na hora (estado em memória +
  localStorage), e como é tudo na mesma aba isso já é "tempo real" o
  suficiente — não tem um segundo dispositivo ou pessoa pra sincronizar com
  ainda. Só passa a valer WebSocket se de fato existir um segundo ator ao
  vivo (ex.: vendedora montando o carrinho num tablet enquanto a cliente
  acompanha pelo celular, ou o estoque avisando "essa cor acabou" no meio da
  navegação) — confirmar que isso é mesmo o plano antes de construir. As
  mudanças de carrinho já passam todas por um único lugar (`CartProvider`),
  então plugar um broadcaster ali depois é mudança pequena, não retrabalho.
- **Status de pedido pro cliente** ("separando", "enviado", "entregue"): só
  o servidor empurra evento, o cliente não manda nada de volta pelo mesmo
  canal — cabe em Server-Sent Events (SSE), mais simples que WebSocket
  (sem handshake bidirecional nem servidor de socket dedicado).
- **Separação/estoque** (equipe do depósito batendo item por item, possivelmente
  várias pessoas no mesmo pedido ao mesmo tempo): é o caso mais forte de
  WebSocket de verdade — múltiplos atores precisando ver a ação um do outro
  ao vivo. Hoje isso é escopo do Bippa (produto complementar, ver "Fora de
  escopo" abaixo), não deste catálogo — mas a decisão de arquitetura (WebSocket
  ali, não aqui) fica registrada.

Tudo isso depende do backend real (Fase 2) existir — nenhum servidor de
WebSocket/SSE deve ser montado antes disso.

## Outras ferramentas vistas no Colab (Teceo) — preparado, não construído

Analisamos o produto Colab (teceo.co) como referência de "ferramentas de
showroom digital pra atacado". Dessas, `/colecoes` (acima) e a exportação
em PDF/link já foram construídas. O que sobrou, com o dado já preparado em
`web/src/lib/types.ts` (`Product.suggestedRetailPrice`, `Product.markup`,
`Product.videoUrl`, `Product.relatedProductIds`, `Variant.availableFrom`)
mas **sem UI** ainda:

- **Preço sugerido + markup**: depende do Bippa/ERP começar a mandar esse
  dado em `/api/catalog` — a "caixinha" já existe no tipo `Product`, só
  falta popular e mostrar na página de produto/quick-view.
- **Data de disponibilidade por variante**: mesma ideia, `Variant.availableFrom`
  — mostrar isso na grade de cor×tamanho quando o Bippa/ERP mandar.
- **Vídeo por produto**: `Product.videoUrl` já existe no tipo; falta UI no
  quick-view/página de produto pra tocar o vídeo em vez de/além da imagem.
- **Produtos relacionados ("complete o look")**: `Product.relatedProductIds`
  já existe; precisa de UI de edição (provavelmente também em `admin/`,
  parecido com o seletor de produto de `/colecoes`) e de exibição na página
  do produto.
- **Catálogo dinâmico por regra**: no Colab, em vez de escolher produto por
  produto, a loja define uma regra ("tipo de entrega = pré-venda" + "coleção
  X") e o catálogo se atualiza sozinho. É diferente do que `/colecoes` faz
  hoje (lista manual de IDs) — muda o paradigma, não é só um campo novo.
  Sem tipo/dado preparado ainda; vale desenhar quando for a hora, não dá
  pra encaixar como extensão pequena do que existe.
- **Talão de pedidos**: ferramenta de vendedor (não de admin da loja) —
  monta um pedido em tempo real enquanto mostra o catálogo pro comprador,
  tipicamente numa feira/showroom presencial. Reaproveita os tipos
  `CartItem`/`Order` que já existem; a diferença é ser um perfil de usuário
  separado (vendedor, não cliente final nem admin) e depende de login/conta
  — fica pra quando a Fase 2 (identificação de usuário) existir.

## Fora de escopo por enquanto

- Cobrança real (gateway de pagamento) e cotação real de frete — hoje ambos
  são mock, ver acima.
- Separação de pedidos (isso é o Bippa, produto complementar).
- Multi-loja / múltiplas marcas no mesmo catálogo.
