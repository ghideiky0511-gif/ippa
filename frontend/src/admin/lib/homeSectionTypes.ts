// @ts-nocheck
// "Classes de dados" do editor — espelham exatamente web/src/lib/types.ts
// (HomeSection/Banner/Product), que é quem valida esse formato de verdade
// hoje (via web/src/app/api/home-sections/route.ts). admin/ fica em JS puro
// por enquanto, então isso é JSDoc em vez de TypeScript — mesma forma,
// intellisense igual, sem exigir toolchain de TS neste app. Quando o
// backend de verdade existir, é esse o contrato que ele precisa preencher.
//
// Canvas de posicionamento livre (x/y/width/height em px, referência de
// 1200px de largura). Isso é um ambiente de criação de layout: mover ou
// redimensionar um bloco NUNCA reposiciona os outros — cada bloco só muda
// quando o adm arrasta aquele bloco especificamente. Ver CANVAS_WIDTH em
// blockRegistry.js.

/**
 * @typedef {Object} BannerItem
 * @property {string} id
 * @property {'image'|'video'} type
 * @property {string} mediaUrl
 * @property {string} [title]
 * @property {string} [subtitle]
 */

/**
 * @typedef {Object} BannerSection
 * @property {'banner'} type
 * @property {string} id
 * @property {BannerItem[]} banners
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} ProductSection
 * Um produto = um bloco. Sem grade fixa: pra mostrar vários produtos a loja
 * arrasta um bloco "Produto" por peça e posiciona/redimensiona como quiser.
 * @property {'product'} type
 * @property {string} id
 * @property {string} productId
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/** @typedef {BannerSection | ProductSection} HomeSection */

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string} [category]
 * @property {number} price
 * @property {string} [image]
 * @property {string[]} [colors]
 * @property {string} [videoUrl] Preparado pra quando o produto tiver vídeo próprio (não o de banner) — sem UI de edição aqui ainda.
 * @property {number} [suggestedRetailPrice] Preço sugerido de revenda, vindo do Bippa/ERP.
 * @property {number} [markup] suggestedRetailPrice / price.
 * @property {string[]} [relatedProductIds] "Complete o look" — vínculo manual entre produtos.
 * @property {string[]} [similarProductIdsQuickview] Curadoria manual de "produtos similares" pro quick-view/página do produto — editável em /produtos.
 * @property {string[]} [similarProductIdsCart] Curadoria manual de "produtos similares" pro carrinho — editável em /produtos.
 */

/**
 * @typedef {Object} SimilarProductsRuleConfig
 * @property {number} limit
 * @property {string[]} rules
 */

/**
 * @typedef {Object} SimilarProductsSettings Configuração de "produtos similares" (web/src/data/similarProductsSettings.json,
 * editável em admin/src/app/ferramentas).
 * @property {SimilarProductsRuleConfig} quickview
 * @property {SimilarProductsRuleConfig} cart
 * @property {Object.<string, string[]>} complementaryCategories
 */

/**
 * @typedef {Object} Highlight Uma coleção nomeada de produtos (web/src/data/highlights.json,
 * editável em admin/src/app/colecoes) — ordem do array = ordem de
 * exibição, arrastável no editor.
 * @property {string} id
 * @property {string} label
 * @property {string[]} productIds
 */

export {};
