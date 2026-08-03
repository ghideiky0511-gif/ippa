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

Abra `http://localhost:3000`. Os dados vêm do Server Component (`src/app/page.js`, que importa `src/data/catalog.json`) e também ficam expostos em `GET /api/catalog` — esse endpoint é o ponto de troca para a Fase 2 (dado real da Bippa/ERP) sem mexer no front.

### Estrutura

- `src/app/page.js` — Server Component, carrega o catálogo e renderiza `<CatalogApp>` (grade + filtros).
- `src/app/produto/[id]/page.js` — página de detalhe de um produto (grade completa de cor x tamanho, descrição, tipo de entrega).
- `src/app/pedidos/page.js` — "Meus pedidos": histórico de pedidos enviados via WhatsApp, salvo em localStorage.
- `src/app/api/catalog/route.js` — Route Handler que serve o catálogo (hoje estático, amanhã vindo de uma API real).
- `src/components/AppShell.js` — top nav + carrinho global (fica disponível em todas as páginas).
- `src/components/CartProvider.js` — estado do carrinho (Context + localStorage) e histórico de pedidos.
- `src/components/CatalogApp.js` — grade de produtos + filtros + abertura do quick-view.
- `src/components/ProductCard.js` — card da grade: imagem, nome, preço, bolinhas de cor disponíveis e botão **+** (abre o quick-view). Não tem mais "adicionar ao carrinho" — isso só existe na página/quick-view de detalhe.
- `src/components/ProductQuickView.js` — painel lateral (anima da direita) aberto pelo **+** do card, com o conteúdo de `ProductDetailContent`.
- `src/components/ProductDetailContent.js` — conteúdo compartilhado entre o quick-view e a página `/produto/[id]`: cores (disponíveis e indisponíveis), grade de tamanhos, tipo de entrega (pronta entrega / pré-venda / esgotado), quantidade e adicionar ao carrinho.
- `src/lib/variants.js` — monta a matriz cor x tamanho de um produto e traduz `availability` em rótulo de entrega.
- `src/lib/config.js` — `CONFIG` (nome da loja, número de WhatsApp, URL do vídeo do banner) e `COLOR_MAP` (swatches por nome de cor).
- `src/data/catalog.json` — cópia do dataset real (285 produtos) usada pelo app.

## Configuração rápida

Em `web/src/lib/config.js`:

```js
export const CONFIG = {
  storeName: 'Fashion Girl Atacado',
  whatsappNumber: '', // número da loja em formato internacional só números, ex: '5511999999999'
  bannerVideoUrl: '', // URL de um .mp4 para o banner virar vídeo em vez de texto
};
```

- Sem `whatsappNumber` preenchido, o botão "Finalizar pedido via WhatsApp" avisa para configurar em vez de abrir um link quebrado.
- Cores fora de `COLOR_MAP` aparecem só como texto (sem swatch colorido).

## O que já resolve das dores mapeadas

- Filtros reais por categoria/cor/tamanho (não só busca por texto).
- Banner pronto para vídeo (bastando configurar `bannerVideoUrl`).
- Identidade visual via variáveis CSS (`--brand-primary` etc.) em vez de layout fixo.
- Pedido pode ser criado remotamente (carrinho + WhatsApp), não só no showroom.
- Página própria por produto, com a grade completa de cor x tamanho e tipo de entrega — pré-requisito pra "produtos similares".
- Carrinho persiste entre navegação e reload (localStorage), e cada pedido enviado fica visível em "Meus pedidos".

## Fora de escopo por enquanto (fases futuras)

Ver `PLANO-PROXIMOS-PASSOS.md` para o detalhe. Resumo:

- Integração real de estoque/API (Bippa, ERP) — `/api/catalog` hoje só devolve o `catalog.json` estático, mas já é o lugar certo para plugar isso na Fase 2.
- "Meus pedidos" hoje é por navegador (localStorage), sem login nem confirmação do lado do servidor.
- "Produtos similares" na página de produto.
- IA (imagem↔descrição, carrinho por texto livre do WhatsApp).

## Origem dos dados

Extraídos de `https://vesti.co/fashiongirlatacado/catalogo.xml` (feed fornecido para teste, formato RSS/Google Merchant). O `FASHION GIRL ATACADO.html` salvo localmente é uma SPA (React) sem dados embutidos no HTML — por isso o feed XML foi usado como fonte real dos 285 produtos.
