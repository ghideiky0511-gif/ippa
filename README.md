# Catálogo — MVP (Bippa/IPA)

Catálogo populado com dados reais da Fashion Girl Atacado (feed público `catalogo.xml`, formato Google Merchant), usado como massa de teste para validar o produto antes de plugar dados/loja reais.

Stack: **Next.js (React) + rotas de API em Node**, em `web/`. Não existe mais versão estática — o `index.html`/`catalog.json` da raiz foi removido depois da migração.

- `apresentacao-catalogo-ipa.pdf`: deck de apresentação (dores, proposta, IA planejada, roadmap por fases, print do MVP). Fonte editável em `apresentacao-catalogo-ipa.html`.
- `PLANO-PROXIMOS-PASSOS.md`: plano da parte do cliente do catálogo (detalhe de produto, meus pedidos, o que falta pra virar produto real).

## Como rodar

Requer Node.js instalado (usado aqui: v24 LTS, instalado via `winget install OpenJS.NodeJS.LTS`).

```bash
cd web
npm install   # só na primeira vez
npm run dev
```

Abra `http://localhost:3000`. Os dados vêm de Server Components que importam `src/data/catalog.json` direto e também ficam expostos em `GET /api/catalog` — esse endpoint é o ponto de troca para a Fase 2 (dado real da Bippa/ERP) sem mexer no front.

### Estrutura

- `src/app/page.js` — Server Component, home de vitrine: banner/carrossel, menu de categorias, produtos em destaque (`<HomeApp>`).
- `src/app/catalogo/page.js` — grade completa com filtros (`<CatalogApp>`) — a antiga home.
- `src/app/produto/[id]/page.js` — página de detalhe de um produto (grade completa de cor x tamanho, descrição, tipo de entrega).
- `src/app/carrinho/page.js` — confirmação do carrinho em página cheia (passo 1 do checkout pelo site).
- `src/app/frete/page.js` — escolha de frete (mock: CEP não influencia o cálculo, é lista fixa em `src/lib/shipping.js`).
- `src/app/pagamento/page.js` — escolha de forma de pagamento (Pix/Cartão/Boleto) + confirmação do pedido (mock: nenhuma cobrança real).
- `src/app/pedido-confirmado/page.js` — tela de sucesso depois de confirmar o pedido pelo site.
- `src/app/pedidos/page.js` — "Meus pedidos": histórico de pedidos (WhatsApp ou site), salvo em localStorage.
- `src/app/api/catalog/route.js` — Route Handler que serve o catálogo (hoje estático, amanhã vindo de uma API real).
- `src/components/AppShell.js` — top nav + carrinho global (fica disponível em todas as páginas).
- `src/components/CartProvider.js` — estado do carrinho (Context + localStorage), frete escolhido (`shipping`, transitório) e histórico de pedidos (`saveOrderToHistory(items, total, extra)`, onde `extra` guarda `channel`/`shipping`/`paymentMethod`).
- `src/components/CartDrawer.js` / `CartItemRow.js` — drawer lateral do carrinho; a linha de item é compartilhada com a página `/carrinho`.
- `src/components/CheckoutSteps.js` — indicador "1. Carrinho — 2. Frete — 3. Pagamento" usado nas 3 páginas do checkout pelo site.
- `src/components/CatalogApp.js` — grade de produtos + filtros + abertura do quick-view. Lê `?categoria=`/`?subcategoria=` da URL (vindo do menu da home) pra pré-selecionar o filtro.
- `src/components/HomeApp.js` — monta a home: `HomeBanner` + `CategoryMenu` + seção "Produtos em destaque" (mesmos `ProductCard`/`ProductQuickView` da grade).
- `src/components/HomeBanner.js` — carrossel de banners (`CONFIG.home.banners`, imagem ou vídeo por slide, setas + bolinhas); sem banners configurados, cai num slide de texto com o `storeName`.
- `src/components/CategoryMenu.js` — menu de categorias; categorias com subcategoria viram dropdown (abre no hover no desktop via CSS `@media (hover:hover)`, e no clique/toque no mobile via estado React), linkando pra `/catalogo?categoria=...&subcategoria=...`.
- `src/components/ProductCard.js` — card da grade: imagem, nome, preço, bolinhas de cor disponíveis e botão **+** (abre o quick-view). Não tem mais "adicionar ao carrinho" — isso só existe na página/quick-view de detalhe.
- `src/components/ProductQuickView.js` — painel lateral (anima da direita) aberto pelo **+** do card, com o conteúdo de `ProductDetailContent`.
- `src/components/ProductDetailContent.js` — conteúdo compartilhado entre o quick-view e a página `/produto/[id]`: cores (disponíveis e indisponíveis), grade de tamanhos, tipo de entrega (pronta entrega / pré-venda / esgotado), quantidade e adicionar ao carrinho.
- `src/lib/variants.js` — monta a matriz cor x tamanho de um produto e traduz `availability` em rótulo de entrega.
- `src/lib/catalogFacets.js` — deriva categorias/cores/tamanhos e a árvore categoria→subcategoria do catálogo, e resolve os produtos em destaque a partir dos IDs no `CONFIG`.
- `src/lib/shipping.js` — mock das opções de frete (`calculateShipping(cep)` ignora o CEP hoje; é o ponto de troca pra uma cotação real de transportadora depois).
- `src/lib/config.js` — `CONFIG` (nome/logo da loja, WhatsApp, banners e produtos em destaque da home) e `COLOR_MAP` (swatches por nome de cor).
- `src/data/catalog.json` — cópia do dataset real (285 produtos) usada pelo app.

## Configuração rápida

Em `web/src/lib/config.js`:

```js
export const CONFIG = {
  storeName: 'Fashion Girl Atacado',
  logoUrl: '', // opcional; sem logo, mostra o storeName como texto no topo
  whatsappNumber: '', // número da loja em formato internacional só números, ex: '5511999999999'
  home: {
    banners: [{ id: 'b1', type: 'image', mediaUrl: '...', title: '...', subtitle: '...' }], // type: 'image' | 'video'
    featuredProductIds: ['<ids de web/src/data/catalog.json>'], // curadoria manual da vitrine
  },
};
```

- Sem `whatsappNumber` preenchido, o botão "Finalizar pedido via WhatsApp" avisa para configurar em vez de abrir um link quebrado.
- Cores fora de `COLOR_MAP` aparecem só como texto (sem swatch colorido).
- Sem `home.banners`, a home cai num banner de texto só com o `storeName`. Sem `home.featuredProductIds`, a seção de destaques simplesmente não aparece.

## O que já resolve das dores mapeadas

- Home de vitrine própria (banners/vídeo em carrossel, menu de categorias com subcategoria em dropdown, produtos em destaque) separada da busca (`/catalogo`).
- Filtros reais por categoria/cor/tamanho (não só busca por texto).
- Identidade visual via variáveis CSS (`--brand-primary` etc.) e conteúdo (`CONFIG`) em vez de layout fixo — ainda um arquivo por deploy, não multi-tenant de verdade (ver `PLANO-PROXIMOS-PASSOS.md`).
- Pedido pode ser criado remotamente (carrinho + WhatsApp), não só no showroom.
- Página própria por produto, com a grade completa de cor x tamanho e tipo de entrega — pré-requisito pra "produtos similares".
- Carrinho persiste entre navegação e reload (localStorage), e cada pedido enviado fica visível em "Meus pedidos".
- Fluxo alternativo de checkout direto no site (carrinho → frete → pagamento), sem sair pro WhatsApp — frete e pagamento são mock (sem transportadora nem gateway reais ainda).

## Fora de escopo por enquanto (fases futuras)

Ver `PLANO-PROXIMOS-PASSOS.md` para o detalhe. Resumo:

- Integração real de estoque/API (Bippa, ERP) — `/api/catalog` hoje só devolve o `catalog.json` estático, mas já é o lugar certo para plugar isso na Fase 2.
- Frete e pagamento no site são mock (`src/lib/shipping.js` e a seleção de método em `/pagamento`) — sem cotação de transportadora nem gateway de pagamento reais.
- "Meus pedidos" hoje é por navegador (localStorage), sem login nem confirmação do lado do servidor.
- "Produtos similares" na página de produto.
- IA (imagem↔descrição, carrinho por texto livre do WhatsApp).

## Origem dos dados

Extraídos de `https://vesti.co/fashiongirlatacado/catalogo.xml` (feed fornecido para teste, formato RSS/Google Merchant). O `FASHION GIRL ATACADO.html` salvo localmente é uma SPA (React) sem dados embutidos no HTML — por isso o feed XML foi usado como fonte real dos 285 produtos.
