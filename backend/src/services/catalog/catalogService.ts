import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { CategoryTreeEntry, Classification, ClassificationType, Discount, Highlight, Product, Variant } from "@/lib/types";
import type { ProductAdmin, ProductSourceOrigin } from "@/contracts/products";
import type { CatalogPage, CatalogSectionsResult } from "@/contracts/catalog";
import {
    listInventoryBalanceRows,
    listProductPackItemRows,
    listProductPackRows,
    listProductRows,
    listProductVariantRows,
} from "@/models/catalogModel";
import { listCategoryMenuRows, listVariantClassificationRows } from "@/models/classificationModel";
import {
    findStoreSettingsRow,
    listDiscountProductRows,
    listDiscountRows,
    listDiscountTierRows,
} from "@/models/settingsModel";
import { getActiveProductDiscount } from "@/services/settings/discountCalculator";
import { listHighlights } from "@/services/settings/highlightService";
import { resolveCatalogMedia } from "@/services/catalog/catalogMediaService";

// Árvore categoria->subcategorias pro menu público — direto de `classifications`/
// `classification_types` (hierarquia real via `parent_id`, sem heurística de
// nome), já filtrada pelo opt-in do tenant (`active`, ver listCategoryMenuRows).
export async function categoryMenu(tenant: Tenant): Promise<CategoryTreeEntry[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const rows = await listCategoryMenuRows(client);
        const childrenByParent = new Map<string | null, typeof rows>();
        for (const row of rows) {
            const siblings = childrenByParent.get(row.parent_id) ?? [];
            siblings.push(row);
            childrenByParent.set(row.parent_id, siblings);
        }
        const build = (parentId: string | null): CategoryTreeEntry[] =>
            (childrenByParent.get(parentId) ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                level: row.category_level ?? 1,
                children: build(row.id),
            }));
        return build(null);
    });
}

export interface CatalogFilters {
    categories: CategoryTreeEntry[];
    colors: string[];
    sizes: string[];
}

export function hasPublicCatalogPrice(price: string | number): boolean {
    const numericPrice = Number(price);
    return Number.isFinite(numericPrice) && numericPrice > 0;
}

export async function listCatalogFilters(tenant: Tenant): Promise<CatalogFilters> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const [categories, variants, products] = await Promise.all([
            categoryMenu(tenant),
            listProductVariantRows(client),
            listProductRows(client),
        ]);
        const visibleProductIds = new Set(
            products.filter((product) => hasPublicCatalogPrice(product.price)).map((product) => product.id),
        );
        const visibleVariants = variants.filter((variant) => visibleProductIds.has(variant.product_id));

        const allColors = [...new Set(visibleVariants.map((v) => v.color).filter(Boolean))].sort();
        const allSizes = [...new Set(visibleVariants.map((v) => v.size).filter(Boolean))].sort((a, b) =>
            isNaN(Number(a)) || isNaN(Number(b)) ? a.localeCompare(b) : Number(a) - Number(b)
        );

        return {
            categories,
            colors: allColors,
            sizes: allSizes,
        };
    });
}

async function loadCatalog(tenant: Tenant, includeProductsWithoutPrice: boolean): Promise<Product[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const productRows = await listProductRows(client);
        const products = includeProductsWithoutPrice
            ? productRows
            : productRows.filter((product) => hasPublicCatalogPrice(product.price));
        if (products.length === 0) return [];

        const [variants, balances, classifications, packs, packItems, storeSettings, discountRows, tierRows, discountProductRows] = await Promise.all([
            listProductVariantRows(client),
            listInventoryBalanceRows(client),
            listVariantClassificationRows(client),
            listProductPackRows(client),
            listProductPackItemRows(client),
            findStoreSettingsRow(client),
            listDiscountRows(client),
            listDiscountTierRows(client),
            listDiscountProductRows(client),
        ]);
        const discounts: Discount[] = discountRows.map((discount) => ({
            id: discount.id,
            label: discount.label,
            active: discount.active,
            type: discount.type,
            percent: Number(discount.percent),
            tiers: tierRows.filter((tier) => tier.discount_id === discount.id)
                .map((tier) => ({ minQty: tier.min_qty, percent: Number(tier.percent) })),
            productIds: discountProductRows.filter((product) => product.discount_id === discount.id)
                .map((product) => product.product_id),
        }));
        const stockByVariant = new Map(balances.map((row) => [row.variant_id, row.stock_qty]));
        const classificationsByVariant = new Map<string, Classification[]>();
        for (const row of classifications) {
            if (!row.variant_id) continue;
            const values = classificationsByVariant.get(row.variant_id) ?? [];
            values.push({
                id: row.id,
                externalCode: row.external_code,
                name: row.name,
                auxiliaryName: row.auxiliary_name ?? undefined,
                parentId: row.parent_id ?? undefined,
                active: row.active,
                type: {
                    id: row.classification_type_id,
                    integrationId: row.integration_id,
                    externalCode: row.type_external_code,
                    label: row.type_label,
                    auxiliaryLabel: row.type_auxiliary_label ?? undefined,
                    categoryLevel: row.category_level ?? undefined,
                    active: row.type_active,
                } satisfies ClassificationType,
            });
            classificationsByVariant.set(row.variant_id, values);
        }
        const variantsByProduct = new Map<string, Variant[]>();
        for (const row of variants) {
            const productVariants = variantsByProduct.get(row.product_id) ?? [];
            productVariants.push({
                id: row.id,
                color: row.color,
                size: row.size,
                price: Number(row.price),
                availability: row.availability,
                availableFrom: row.available_from ?? undefined,
                stockQty: row.track_inventory ? (stockByVariant.get(row.id) ?? 0) : undefined,
                classifications: classificationsByVariant.get(row.id) ?? [],
            });
            variantsByProduct.set(row.product_id, productVariants);
        }

        return Promise.all(products.map(async (row) => {
            const productVariants = variantsByProduct.get(row.id) ?? [];
            const resolvedMedia = await resolveCatalogMedia(row.media);
            const { manualOverride, ...attributes } = row.attributes as typeof row.attributes & {
                manualOverride?: Partial<Product>;
            };
            let product: Product = {
                id: row.id,
                name: row.name,
                description: row.description,
                referenceId: row.reference_id ?? undefined,
                price: Number(row.price),
                suggestedRetailPrice: row.suggested_retail_price ? Number(row.suggested_retail_price) : undefined,
                markup: row.markup ? Number(row.markup) : undefined,
                image: resolvedMedia.image,
                images: resolvedMedia.images,
                imagesByColor: resolvedMedia.imagesByColor,
                videoUrl: resolvedMedia.videoUrl,
                colors: [...new Set(productVariants.map((variant) => variant.color))],
                sizes: [...new Set(productVariants.map((variant) => variant.size))],
                variants: productVariants,
                packs: packs.filter((pack) => pack.product_id === row.id).map((pack) => ({
                    id: pack.id,
                    scope: pack.scope,
                    label: pack.label,
                    color: pack.color ?? undefined,
                    price: Number(pack.price),
                    items: packItems.filter((item) => item.pack_id === pack.id).map((item) => ({
                        size: item.size,
                        qty: item.quantity,
                        color: item.color ?? undefined,
                    })),
                })),
                ...attributes,
                ...(row.source_origin === "erp" ? {} : manualOverride),
            } as Product;
            if (canApplyDefaultMarkup(row.source_origin) && storeSettings?.default_markup && product.suggestedRetailPrice === undefined && product.markup === undefined) {
                const defaultMarkup = Number(storeSettings.default_markup);
                product = {
                    ...product,
                    suggestedRetailPrice: Math.round(product.price * defaultMarkup * 100) / 100,
                    markup: defaultMarkup,
                };
            }
            const activeDiscount = getActiveProductDiscount(product.id, discounts);
            if (activeDiscount) product = { ...product, activeDiscount };
            if (storeSettings?.features?.suggestedPrice === false) {
                const withoutSuggestedPrice = { ...product };
                delete withoutSuggestedPrice.suggestedRetailPrice;
                delete withoutSuggestedPrice.markup;
                product = withoutSuggestedPrice;
            }
            return product;
        }));
    });
}

/** Catálogo público: produtos sem preço vendável permanecem no workspace, mas não são publicados. */
export async function listCatalog(tenant: Tenant): Promise<Product[]> {
    return loadCatalog(tenant, false);
}

export function canApplyDefaultMarkup(sourceOrigin: ProductSourceOrigin): boolean {
    return sourceOrigin !== "erp";
}

/** Visão exclusiva do workspace, com a origem usada para controlar edição. */
export async function listAdminProducts(tenant: Tenant): Promise<ProductAdmin[]> {
    const [products, sourceRows] = await Promise.all([
        loadCatalog(tenant, true),
        withTenantTransaction(tenant, {}, (client) => listProductRows(client)),
    ]);
    const sourceById = new Map(sourceRows.map((row) => [row.id, row.source_origin]));
    return products.map((product) => ({
        ...product,
        sourceOrigin: sourceById.get(product.id) ?? "manual",
    }));
}

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

// Parâmetros de consulta padronizados do catálogo — todo consumidor
// (grade paginada, vitrine de destaque, futura tela de admin) monta um
// desses e chama listCatalogPage/listCatalogSections; nenhuma tela
// reimplementa seu próprio corte da lista de produtos.
export interface CatalogQuery {
    page?: number;
    pageSize?: number;
    term?: string;
    classificationId?: string;
    color?: string;
    size?: string;
    // Conjunto exato e ordenado a retornar (uma vitrine de destaque, por
    // exemplo) — quando presente, ignora page/pageSize e devolve tudo que
    // casar, na ordem dada.
    ids?: string[];
    excludeIds?: string[];
    // Restringe aos IDs dados sem alterar ordem/paginação (ex.: recorte por
    // público-alvo combinado com os demais filtros).
    restrictIds?: string[];
    // Exclui qualquer produto que pertença a algum Highlight cadastrado ou
    // tenha desconto ativo — a mesma regra usada para montar "outros
    // produtos" em listCatalogSections, disponível aqui pra quem pagina
    // essa vitrine manualmente (scroll infinito).
    excludeFeatured?: boolean;
}

function filterCatalogVariants(product: Product, query: {
    term?: string; classificationId?: string; color?: string; size?: string; restrictIds?: string[]; excludeIds?: string[];
}): Product | undefined {
    const term = query.term?.trim().toLowerCase();
    if (term
        && !(product.name || "").toLowerCase().includes(term)
        && !(product.referenceId || "").toLowerCase().includes(term)) return undefined;
    // Categorias "dobradas" no menu (ex.: BODY ALCA vira subcategoria de
    // BODY) têm produtos cujo `category` real é o nome dobrado — some do
    // filtro se a gente só comparar contra `subcategory`.
    if (query.restrictIds && !query.restrictIds.includes(product.id)) return undefined;
    if (query.excludeIds && query.excludeIds.includes(product.id)) return undefined;
    const variants = product.variants.filter((variant) =>
        (!query.classificationId || variant.classifications.some((classification) => classification.id === query.classificationId))
        && (!query.color || variant.color === query.color)
        && (!query.size || variant.size === query.size),
    );
    if ((query.classificationId || query.color || query.size) && variants.length === 0) return undefined;
    const visibleVariants = query.classificationId || query.color || query.size ? variants : product.variants;
    return {
        ...product,
        variants: visibleVariants,
        colors: [...new Set(visibleVariants.map((variant) => variant.color))],
        sizes: [...new Set(visibleVariants.map((variant) => variant.size))],
    };
}

function featuredProductIds(products: Product[], highlights: Highlight[]): Set<string> {
    const ids = new Set<string>();
    for (const highlight of highlights) for (const id of highlight.productIds) ids.add(id);
    for (const product of products) if (product.activeDiscount) ids.add(product.id);
    return ids;
}

function pickByIds(products: Product[], ids: string[]): Product[] {
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
}

function paginate(items: Product[], page?: number, pageSize?: number): CatalogPage {
    const size = Math.min(Math.max(pageSize || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const current = Math.max(page || 1, 1);
    const start = (current - 1) * size;
    return {
        items: items.slice(start, start + size),
        pagination: { page: current, pageSize: size, total: items.length, totalPages: Math.max(Math.ceil(items.length / size), 1) },
    };
}

export async function listCatalogPage(tenant: Tenant, query: CatalogQuery): Promise<CatalogPage> {
    const [products, highlights] = await Promise.all([
        listCatalog(tenant),
        query.excludeFeatured ? listHighlights(tenant) : Promise.resolve<Highlight[]>([]),
    ]);
    let matching = products
        .map((product) => filterCatalogVariants(product, query))
        .filter((product): product is Product => Boolean(product));
    if (query.excludeFeatured) {
        const featuredIds = featuredProductIds(matching, highlights);
        matching = matching.filter((p) => !featuredIds.has(p.id));
    }
    if (query.ids) {
        const items = pickByIds(matching, query.ids);
        return { items, pagination: { page: 1, pageSize: items.length || 1, total: items.length, totalPages: 1 } };
    }
    return paginate(matching, query.page, query.pageSize);
}

export interface CatalogSectionsQuery {
    term?: string;
    classificationId?: string;
    color?: string;
    size?: string;
    restrictIds?: string[];
    excludeIds?: string[];
    pageSize?: number;
}

export async function listCatalogSections(tenant: Tenant, query: CatalogSectionsQuery): Promise<CatalogSectionsResult> {
    const [products, highlights] = await Promise.all([listCatalog(tenant), listHighlights(tenant)]);
    const matching = products
        .map((product) => filterCatalogVariants(product, query))
        .filter((product): product is Product => Boolean(product));
    // Só coleções publicadas (showInCatalog) viram vitrine — mas featuredIds
    // abaixo usa `highlights` inteiro (sem esse filtro), então produto de
    // coleção ainda oculta continua fora de "outros produtos".
    const highlightSections = highlights
        .filter((h) => h.showInCatalog)
        .map((h) => ({ id: h.id, label: h.label, items: pickByIds(matching, h.productIds) }));
    const promoSection = { id: "promocoes", label: "Promoções", items: matching.filter((p) => !!p.activeDiscount) };
    const sections = [...highlightSections, promoSection].filter((s) => s.items.length > 0);
    const featuredIds = featuredProductIds(matching, highlights);
    const outrosPool = matching.filter((p) => !featuredIds.has(p.id));
    return {
        sections,
        all: paginate(matching, 1, query.pageSize),
        outros: paginate(outrosPool, 1, query.pageSize),
    };
}
