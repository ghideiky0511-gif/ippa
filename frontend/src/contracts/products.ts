// GERADO a partir de backend/src/contracts — não editar à mão.
// Rode `node scripts/sync-contracts.mjs` (ou `npm run sync-contracts` no
// backend) depois de mudar o arquivo de origem.
import { z } from 'zod';
import {
  EntityIdSchema,
  HttpUrlSchema,
  MoneySchema,
  NonNegativeIntegerSchema,
  OptionalTextSchema,
  PositiveIntegerSchema,
  RequiredTextSchema,
} from './shared';

export const AvailabilitySchema = z.enum(['in_stock', 'preorder', 'backorder', 'out_of_stock']);
export type Availability = z.infer<typeof AvailabilitySchema>;

export const VariantSchema = z.object({
  id: EntityIdSchema,
  color: RequiredTextSchema,
  size: RequiredTextSchema,
  price: MoneySchema,
  availability: AvailabilitySchema,
  // Quando disponível vem do ERP: data (ISO ou "mês/ano" livre, ex.
  // "2027-05") a partir de quando essa variante em pré-venda/backorder fica
  // disponível — mostrado na grade de cor×tamanho do produto (inspirado no
  // Teceo Colab). Sem UI de edição ainda: é a fonte de dado (Bippa/ERP),
  // não algo que a loja cadastra pelo admin. Formato livre (não ISO estrito)
  // de propósito, por isso z.string() e não z.iso.date().
  availableFrom: z.string().optional(),
  // Quantidade em estoque pra essa variante específica, quando o Bippa/ERP
  // mandar. Sem valor = sem controle de estoque (comportamento de hoje: o
  // stepper de quantidade não tem limite). Com valor, é o que separa
  // "pronta entrega" de "excedente sob encomenda" no seletor de quantidade
  // — ver splitStockQty em frontend/src/lib/variants.ts.
  stockQty: NonNegativeIntegerSchema.optional(),
});
export type Variant = z.infer<typeof VariantSchema>;

// Como o ERP pode descrever a "grade" (composição de tamanho/cor) de um
// produto — 3 formatos combinados com o usuário:
// 1. 'unit'  — venda por SKU individual (ex. "1 P", "1 G"): é o que a
//    grade normal (matrix cor×tamanho, ProductDetailContent) já faz hoje,
//    sem precisar de Pack nenhum.
// 2. 'grade' — grade fechada de uma cor só, várias combinações possíveis
//    de tamanho+qty (ex. "Grade tipo 1" = 1M+2P+3G). Um mesmo produto pode
//    ter vários tipos de grade diferentes (Grade tipo 1, tipo 2, ...) —
//    cada um é um Pack separado com scope='grade'.
// 3. 'pack'  — mistura tamanho + quantidade + cor num bundle só (cor varia
//    por item dentro do mesmo pack) — usa PackItem.color.
export const PackScopeSchema = z.enum(['grade', 'pack']);
export type PackScope = z.infer<typeof PackScopeSchema>;

// Um pack é uma grade fechada que já vem montada de fábrica (ex.: 1×P +
// 2×M + 1×G, vendido como uma unidade só, num preço próprio) — diferente
// de escolher tamanho a tamanho na grade normal (essa é scope='unit', que
// nem gera Pack). `items` é a composição fechada; não dá pra tirar um
// tamanho de dentro do pack.
export const PackItemSchema = z.object({
  size: RequiredTextSchema,
  qty: PositiveIntegerSchema,
  // Cor deste item. Só usado/relevante quando Pack.scope === 'pack' (o
  // bundle mistura cores); em scope 'grade' a cor é única e vem de
  // Pack.color, então PackItem.color fica de fora.
  color: z.string().optional(),
});
export type PackItem = z.infer<typeof PackItemSchema>;

export const PackSchema = z.object({
  id: EntityIdSchema,
  scope: PackScopeSchema,
  label: RequiredTextSchema, // ex. "Grade tipo 1", "Pack sortido verão"
  color: z.string().optional(), // cor única do bundle — usado quando scope='grade'; ignorado quando scope='pack' (cor vem por item, ver PackItem.color)
  price: MoneySchema, // preço do pack fechado (não é a soma automática dos preços unitários)
  items: z.array(PackItemSchema),
});
export type Pack = z.infer<typeof PackSchema>;

export const ProductSchema = z.object({
  id: EntityIdSchema,
  name: RequiredTextSchema,
  description: z.string(),
  category: z.string(),
  subcategory: z.string().optional(),
  // Coleção/temporada da peça (ex. "Verão 2027") — dado da loja, sem
  // origem no ERP hoje (se um dia o Bippa/ERP passar a mandar, some daqui
  // e vira igual category: já vem pronto do catalog.json). Ausente = peça
  // atemporal (vende o ano todo, fora de qualquer coleção). Editável em
  // /produtos (ver ProductOverride em contracts/catalog.ts).
  collection: z.string().optional(),
  brand: z.string().optional(),
  referenceId: z.string().optional(), // código de referência (REF) — vem do ERP (ex. TOTVS Moda ReferenceCode) ou digitado à mão pra produto manual; mostrado no card e na página de produto
  price: MoneySchema,
  image: z.string().optional(),
  images: z.array(z.string()).optional(),
  imagesByColor: z.record(z.string(), z.string()).optional(),
  colors: z.array(z.string()),
  sizes: z.array(z.string()),
  variants: z.array(VariantSchema),
  // Campos abaixo: "caixinhas" já preparadas pra quando essa informação
  // existir (Bippa/ERP ou loja), sem UI própria ainda.
  videoUrl: z.string().optional(), // vídeo do produto (não confundir com vídeo de banner, ver Banner.type)
  suggestedRetailPrice: MoneySchema.optional(), // preço sugerido de revenda ("R$ 1.320 sugerido" no Colab)
  markup: z.number().finite().nonnegative().optional(), // suggestedRetailPrice / price, calculado ou vindo do ERP — mostrado junto do preço de atacado
  relatedProductIds: z.array(z.string()).optional(), // "complete o look" — vínculo manual entre peças, curado pela loja
  // Packs têm UI de verdade (não só o tipo) — ver ProductDetailContent.tsx.
  // Ainda sem "adicionar ao carrinho" pro pack em si: isso muda o formato
  // do pedido/mensagem de WhatsApp, é uma decisão separada pra quando o
  // ERP realmente mandar pack de verdade.
  packs: z.array(PackSchema).optional(),
  // Curadoria manual de "produtos similares" (ver SimilarProductsSettings
  // em contracts/catalog.ts), 1 por 1, separada por contexto — quando
  // presente (>=1 id), substitui a regra automática desse contexto pra
  // este produto, sem completar até o limite (curadoria manual é
  // intencional, mesmo que fique com menos cards que o limite
  // configurado). undefined = sem curadoria, usa a regra configurada em
  // /ferramentas.
  similarProductIdsQuickview: z.array(z.string()).optional(), // usado no quick-view E na página cheia do produto (mesma âncora: o produto sendo visto)
  similarProductIdsCart: z.array(z.string()).optional(), // usado quando este produto está no carrinho (pode combinar com curadoria de outras peças do mesmo carrinho)
  // Desconto "peças específicas" ativo pra esta peça — calculado no
  // backend a partir dos descontos cadastrados, mostrado como preço
  // riscado no card e na página do produto. NÃO inclui desconto "por
  // quantidade": esse depende de quantas unidades desta peça estão no
  // carrinho (ver cartDiscountByProduct em CartProvider.tsx), que é
  // calculado só no cliente.
  activeDiscount: z.object({ label: z.string(), percent: z.number() }).optional(),
});
export type Product = z.infer<typeof ProductSchema>;

// A loja pública recebe somente os dados de exibição e compra. Curadoria e
// parâmetros administrativos continuam disponíveis em ProductSchema para o
// workspace, sem obrigar novas APIs a expô-los por padrão.
export const ProductPublicSchema = ProductSchema.omit({
  relatedProductIds: true,
  similarProductIdsQuickview: true,
  similarProductIdsCart: true,
  markup: true,
});
export type ProductPublic = z.infer<typeof ProductPublicSchema>;

export const ProductAdminSchema = ProductSchema;
export type ProductAdmin = z.infer<typeof ProductAdminSchema>;

export const CreateProductInputSchema = z.object({
  name: RequiredTextSchema,
  price: MoneySchema,
  category: OptionalTextSchema,
  referenceId: OptionalTextSchema,
  description: OptionalTextSchema,
  image: HttpUrlSchema.optional(),
  variant: z.object({ color: RequiredTextSchema, size: RequiredTextSchema }).optional(),
});
export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;

export const CreateProductResultSchema = z.object({ id: EntityIdSchema });
export type CreateProductResult = z.infer<typeof CreateProductResultSchema>;
