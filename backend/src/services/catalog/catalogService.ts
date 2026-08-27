import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { CategoryTreeEntry, Discount, Highlight, Product, Variant } from "@/lib/types";
import type { ProductAdmin, ProductSourceOrigin } from "@/contracts/products";
import type { CatalogPage, CatalogSectionsResult } from "@/contracts/catalog";
import {
    listCategoryMenuRows,
    listInventoryBalanceRows,
    listPrimaryClassificationRows,
    listProductPackItemRows,
    listProductPackRows,
    listProductRows,
    listProductVariantRows,
} from "@/models/catalogModel";
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
        const categories = rows.filter((row) => row.kind === "category");
        const subcategories = rows.filter((row) => row.kind === "subcategory");
        return categories.map((category) => ({
            category: category.name,
            subcategories: subcategories.filter((sub) => sub.parent_id === category.id).map((sub) => sub.name),
        }));
    });
}

export interface CatalogFilters {
    categories: string[];
    colors: string[];
    sizes: string[];
}

export async function listCatalogFilters(tenant: Tenant): Promise<CatalogFilters> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const [categories, variants] = await Promise.all([
            categoryMenu(tenant),
            listProductVariantRows(client),
        ]);

        const allColors = [...new Set(variants.map((v) => v.color).filter(Boolean))].sort();
        const allSizes = [...new Set(variants.map((v) => v.size).filter(Boolean))].sort((a, b) =>
            isNaN(Number(a)) || isNaN(Number(b)) ? a.localeCompare(b) : Number(a) - Number(b)
        );

        return {
            categories: categories.flatMap((c) => [c.category, ...c.subcategories]).filter((v, i, arr) => arr.indexOf(v) === i),
            colors: allColors,
            sizes: allSizes,
        };
    });
}

export async function listCatalog(tenant: Tenant): Promise<Product[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const products = await listProductRows(client);
        if (products.length === 0) return [];

        const [variants, balances, classifications, packs, packItems, storeSettings, discountRows, tierRows, discountProductRows] = await Promise.all([
            listProductVariantRows(client),
            listInventoryBalanceRows(client),
            listPrimaryClassificationRows(client),
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
        const classificationsByProduct = new Map<string, Partial<Record<"category" | "subcategory" | "collection" | "brand", string>>>();
        for (const row of classifications) {
            classificationsByProduct.set(row.product_id, {
                ...classificationsByProduct.get(row.product_id),
                [row.kind]: row.name,
            });
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
            });
            variantsByProduct.set(row.product_id, productVariants);
        }

        return Promise.all(products.map(async (row) => {
            const productVariants = variantsByProduct.get(row.id) ?? [];
            const classification = classificationsByProduct.get(row.id);
            const resolvedMedia = await resolveCatalogMedia(row.media);
            const { manualOverride, ...attributes } = row.attributes as typeof row.attributes & {
                manualOverride?: Partial<Product>;
            };
            let product: Product = {
                id: row.id,
                name: row.name,
                description: row.description,
                category: classification?.category ?? row.category ?? "Sem categoria",
                subcategory: classification?.subcategory ?? row.subcategory ?? undefined,
                collection: classification?.collection ?? row.collection ?? undefined,
                brand: classification?.brand ?? row.brand ?? undefined,
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

export function canApplyDefaultMarkup(sourceOrigin: ProductSourceOrigin): boolean {
    return sourceOrigin !== "erp";
}

/** Visão exclusiva do workspace, com a origem usada para controlar edição. */
export async function listAdminProducts(tenant: Tenant): Promise<ProductAdmin[]> {
    const [products, sourceRows] = await Promise.all([
        listCatalog(tenant),
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
    category?: string;
    subcategory?: string;
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

function matchesCatalogFacets(product: Product, query: {
    term?: string; category?: string; subcategory?: string; color?: string; size?: string; restrictIds?: string[]; excludeIds?: string[];
}): boolean {
    const term = query.term?.trim().toLowerCase();
    if (term && !(product.name || "").toLowerCase().includes(term) && !(product.id || "").toLowerCase().includes(term)) return false;
    // Categorias "dobradas" no menu (ex.: BODY ALCA vira subcategoria de
    // BODY) têm produtos cujo `category` real é o nome dobrado — some do
    // filtro se a gente só comparar contra `subcategory`.
    const isFoldedMatch = !!query.subcategory && product.category === query.subcategory;
    if (query.category && product.category !== query.category && !isFoldedMatch) return false;
    if (query.subcategory && product.subcategory !== query.subcategory && !isFoldedMatch) return false;
    if (query.color && !(product.colors || []).includes(query.color)) return false;
    if (query.size && !(product.sizes || []).includes(query.size)) return false;
    if (query.restrictIds && !query.restrictIds.includes(product.id)) return false;
    if (query.excludeIds && query.excludeIds.includes(product.id)) return false;
    return true;
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
    let matching = products.filter((p) => matchesCatalogFacets(p, query));
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
    category?: string;
    subcategory?: string;
    color?: string;
    size?: string;
    restrictIds?: string[];
    excludeIds?: string[];
    pageSize?: number;
}

export async function listCatalogSections(tenant: Tenant, query: CatalogSectionsQuery): Promise<CatalogSectionsResult> {
    const [products, highlights] = await Promise.all([listCatalog(tenant), listHighlights(tenant)]);
    const matching = products.filter((p) => matchesCatalogFacets(p, query));
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
