// GERADO a partir de backend/src/contracts — não editar à mão.
// Rode `node scripts/sync-contracts.mjs` (ou `npm run sync-contracts` no
// backend) depois de mudar o arquivo de origem.
import { z } from 'zod';
import { ProductSchema, type Product } from './products';
import { CategoryTreeNodeSchema, ClassificationSchema, ClassificationTypeSchema } from './classifications';

export const DiscountTypeSchema = z.enum(['quantity', 'products']);
export type DiscountType = z.infer<typeof DiscountTypeSchema>;

export const HomeSectionTypeSchema = z.enum(['banner', 'product']);
export type HomeSectionType = z.infer<typeof HomeSectionTypeSchema>;

export const BannerMediaTypeSchema = z.enum(['image', 'video']);
export type BannerMediaType = z.infer<typeof BannerMediaTypeSchema>;

export const AssignmentStrategySchema = z.enum(['leastBusy', 'roundRobin', 'any']);
export type AssignmentStrategy = z.infer<typeof AssignmentStrategySchema>;

// Desconto cadastrado pela loja em /descontos (plataforma admin). Dois
// tipos: 'quantity' — progressivo pela quantidade TOTAL de peças do
// pedido (`tiers`, ex. "acima de 10 peças, 10% off"); 'products' —
// percentual fixo (`percent`) só nas peças escolhidas em `productIds`.
export const DiscountTierSchema = z.object({
  minQty: z.number().positive(),
  percent: z.number().min(0).max(100),
});
export type DiscountTier = z.infer<typeof DiscountTierSchema>;

export const DiscountSchema = z.object({
  id: z.string(),
  label: z.string(),
  active: z.boolean(),
  type: DiscountTypeSchema,
  tiers: z.array(DiscountTierSchema),
  productIds: z.array(z.string()),
  percent: z.number().min(0).max(100),
});
export type Discount = z.infer<typeof DiscountSchema>;

export const HighlightSchema = z.object({
  id: z.string(),
  label: z.string(),
  productIds: z.array(z.string()),
  // Liga/desliga a vitrine dessa coleção na barra sticky do catálogo
  // público — coleção nova nasce desmarcada (ver highlightService.ts),
  // a vendedora publica quando quiser. Não afeta a curadoria em si
  // (productIds continua valendo pra excluir de "outros produtos" mesmo
  // com a vitrine oculta, ver featuredProductIds em catalogService.ts).
  showInCatalog: z.boolean(),
});
export type Highlight = z.infer<typeof HighlightSchema>;

export const AudienceSchema = z.object({
  id: z.string(),
  label: z.string(),
  productIds: z.array(z.string()).nullable(),
});
export type Audience = z.infer<typeof AudienceSchema>;

// Contrato padronizado de listagem paginada do catálogo (GET /api/catalog
// com parâmetros) — usado tanto pela grade "outros produtos" com scroll
// infinito de /catalogo quanto por qualquer outra tela que precise pedir
// uma fatia filtrada do catálogo no futuro (admin, busca, etc.).
export const CatalogPaginationSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
});
export type CatalogPagination = z.infer<typeof CatalogPaginationSchema>;

export const CatalogPageSchema = z.object({
  items: z.array(ProductSchema),
  pagination: CatalogPaginationSchema,
});
export type CatalogPage = z.infer<typeof CatalogPageSchema>;

// Carga inicial de /catalogo (GET /api/catalog-sections): uma vitrine por
// Highlight cadastrado + a vitrine fixa de Promoções, mais duas versões
// paginadas do restante do catálogo já filtrado — `outros` (sem nada que já
// apareceu em alguma vitrine, para quando há 2+ vitrines com produto) e
// `all` (tudo, para o fallback de grade única quando há 0 ou 1). O cliente
// escolhe qual das duas usar e pagina o resto via GET /api/catalog.
export const CatalogSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  items: z.array(ProductSchema),
});
export type CatalogSection = z.infer<typeof CatalogSectionSchema>;

export const CatalogSectionsResultSchema = z.object({
  sections: z.array(CatalogSectionSchema),
  all: CatalogPageSchema,
  outros: CatalogPageSchema,
});
export type CatalogSectionsResult = z.infer<typeof CatalogSectionsResultSchema>;

export const BannerSchema = z.object({
  id: z.string(),
  type: BannerMediaTypeSchema,
  mediaUrl: z.string(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
});
export type Banner = z.infer<typeof BannerSchema>;

// Hiperlink opcional que a loja pode exibir no canto inferior direito de
// qualquer bloco da home (banner ou produto). A loja liga/desliga em
// `enabled`, escreve a chamada em `label` (ex.: "acessar catálogo",
// "ver mais") e define o destino em `href` — caminho interno começando
// com `/` (ex.: `/catalogo`, resolvido com o slug do tenant) ou URL
// completa `https://…` (abre em nova aba). Guardado junto do layout do
// bloco (ver homeSectionService.ts), então não some quando o bloco é
// movido/redimensionado.
export const HomeSectionCtaSchema = z.object({
  enabled: z.boolean(),
  label: z.string(),
  href: z.string(),
});
export type HomeSectionCta = z.infer<typeof HomeSectionCtaSchema>;

// Posição/tamanho livres (px, canvas de referência de 1200px de largura —
// mesma largura de `.container`/`.home-sections`). O editor admin é um
// ambiente de criação de layout: nada se move sozinho quando outro bloco
// muda de tamanho, a posição de cada bloco só muda quando o adm arrasta
// aquele bloco especificamente.
//
// x/y/width/height no topo são o layout de DESKTOP (canvas de 1200px). O
// editor tem 3 modos de visualização — desktop, tablet e celular — e cada
// um tem sua própria largura de canvas de referência (1200 / 820 / 390).
// `tablet`/`mobile` guardam só o que a loja ajustou naquele modo; o que
// não foi tocado é derivado proporcionalmente do desktop (ver
// resolveBreakpointLayout em web/src/lib/homeLayout.ts). O site escolhe o
// layout pela largura da janela e posiciona tudo em % do canvas daquele
// breakpoint, então encolhe junto ("vetorizado") sem estourar as laterais.
export const BreakpointLayoutSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type BreakpointLayout = z.infer<typeof BreakpointLayoutSchema>;

export const HomeSectionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('banner'),
    id: z.string(),
    banners: z.array(BannerSchema),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    tablet: BreakpointLayoutSchema.optional(),
    mobile: BreakpointLayoutSchema.optional(),
    // Banner "largura total": ignora x/width e ocupa toda a largura da
    // janela, borda a borda (hero). `fullHeight` faz ocupar também a
    // altura da tela (100svh) em vez da altura em px.
    fullBleed: z.boolean().optional(),
    fullHeight: z.boolean().optional(),
    cta: HomeSectionCtaSchema.optional(),
  }),
  z.object({
    type: z.literal('product'),
    id: z.string(),
    productId: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    tablet: BreakpointLayoutSchema.optional(),
    mobile: BreakpointLayoutSchema.optional(),
    cta: HomeSectionCtaSchema.optional(),
  }),
]);
export type HomeSection = z.infer<typeof HomeSectionSchema>;

// Computado só no backend pra resolver a seção pronta pra render — nunca é
// input nem trafega sozinho como resposta de API, por isso sem schema
// próprio (não precisa validar algo que o próprio backend monta).
export type ResolvedHomeSection = HomeSection & { product?: Product };

export const CategoryTreeEntrySchema = CategoryTreeNodeSchema;
export type CategoryTreeEntry = z.infer<typeof CategoryTreeEntrySchema>;

// Nó da árvore de classificação editável em /categorias (plataforma
// admin) — categoria/subcategoria/coleção/marca cadastradas manualmente
// pela loja, com hierarquia (`parentId`) e ordem de exibição (`position`).
export const ClassificationEntrySchema = z.object({
  classification: ClassificationSchema,
  type: ClassificationTypeSchema,
});
export type ClassificationEntry = z.infer<typeof ClassificationEntrySchema>;

// Configuração da regra de "produtos similares", editável pela loja em
// /ferramentas (plataforma admin) — separada por contexto porque o
// quick-view/página de produto (âncora única: o produto sendo visto) e o
// carrinho (várias âncoras: os produtos já escolhidos) pedem composições
// diferentes.
export const SimilarProductsRuleConfigSchema = z.object({
  limit: z.number().positive(), // quantas peças mostrar nesse contexto
  rules: z.array(z.string()), // ids de regras ativas, na ordem escolhida
});
export type SimilarProductsRuleConfig = z.infer<typeof SimilarProductsRuleConfigSchema>;

export const SimilarProductsSettingsSchema = z.object({
  quickview: SimilarProductsRuleConfigSchema, // usado também pela página cheia do produto (mesma âncora única)
  cart: SimilarProductsRuleConfigSchema,
  complementaryCategories: z.record(z.string(), z.array(z.string())), // categoria -> categorias complementares, usado pela regra "complementaryCategory"
});
export type SimilarProductsSettings = z.infer<typeof SimilarProductsSettingsSchema>;

// Campos de Product editáveis pela loja apenas em produtos locais (manual ou
// bootstrap). Produtos com origem ERP são sempre a fonte de verdade do ERP;
// a API administrativa rejeita overrides para eles.
export const ProductOverrideSchema = ProductSchema.pick({
  referenceId: true,
  suggestedRetailPrice: true,
  markup: true,
  similarProductIdsQuickview: true,
  similarProductIdsCart: true,
}).partial();
export type ProductOverride = z.infer<typeof ProductOverrideSchema>;

export const ProductOverridesSchema = z.record(z.string(), ProductOverrideSchema);
export type ProductOverrides = z.infer<typeof ProductOverridesSchema>;

// Lista fechada: uma flag digitada errado deixa de virar configuração morta
// no JSON do banco. Campos ausentes preservam o padrão histórico de cada UI.
export const StoreFeaturesSchema = z.object({
  suggestedPrice: z.boolean().optional(),
  preSale: z.boolean().optional(),
  readyToShip: z.boolean().optional(),
  publicCatalogPrices: z.boolean().optional(),
  hidePriceWithoutLogin: z.boolean().optional(),
  allowCpfSignup: z.boolean().optional(),
  clientSelfCheckout: z.boolean().optional(),
  // Duplo-clique de qualquer colaboradora (todo papel exceto 'cliente') no
  // "+" do card do catálogo pra marcar a peça como sugestão (fundo amarelo)
  // — ver ProductCard.tsx. Desligada: o botão só seleciona/desseleciona,
  // sem o gesto de sugestão nem o filtro "só sugeridos".
  suggestedPieces: z.boolean().optional(),
}).strict();
export type StoreFeatures = z.infer<typeof StoreFeaturesSchema>;

export const StoreSettingsSchema = z.object({
  defaultMarkup: z.number().positive().optional(),
  assignmentStrategy: AssignmentStrategySchema.optional(),
  paymentLinkExpirationMinutes: z.number().positive().optional(),
  features: StoreFeaturesSchema.optional(),
});
export type StoreSettings = z.infer<typeof StoreSettingsSchema>;

// Item do histórico de gerações da IA da home (POST /api/admin/home-ai) —
// shape de saída de homeAiHistory() em backend/src/services/home/homeAiService.ts,
// não confundir com HomeAiHistoryRow (backend/src/models/homeAiModel.ts),
// que é o formato bruto do banco (created_at: Date, sem `at`).
export const HomeAiHistoryItemSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  sections: z.array(HomeSectionSchema),
  at: z.iso.datetime(),
});
export type HomeAiHistoryItem = z.infer<typeof HomeAiHistoryItemSchema>;
