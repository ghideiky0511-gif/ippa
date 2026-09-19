import type { PoolClient } from "pg";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type {
    CategoryTreeEntry,
    Classification,
    ClassificationType,
    Discount,
    Highlight,
    Product,
    Variant,
} from "@/lib/types";
import type { ProductAdmin, ProductSourceOrigin } from "@/contracts/products";
import type { CatalogPage, CatalogSectionsResult } from "@/contracts/catalog";
import type {
    ProductColorImageRow,
    ProductPackItemRow,
    ProductPackRow,
    ProductRow,
    ProductVariantRow,
} from "@/models/catalogModel";
import {
    findProductRowsByIds,
    listCatalogProductPage,
    listProductColorImageRows,
    listProductColorImageRowsByProductIds,
    listProductPackItemRows,
    listProductPackItemRowsByPackIds,
    listProductPackRows,
    listProductPackRowsByProductIds,
    listProductPickerRows,
    listProductRows,
    listProductVariantRows,
    listProductVariantRowsByProductIds,
} from "@/models/catalogModel";
import { getStockForVariants } from "@/services/inventory/stockCacheService";
import type { ClassificationJoinedRow } from "@/models/classificationModel";
import {
    listCategoryMenuRows,
    listVariantClassificationRows,
    listVariantClassificationRowsByVariantIds,
} from "@/models/classificationModel";
import type {
    DiscountProductRow,
    DiscountRow,
    DiscountTierRow,
    StoreSettingsRow,
} from "@/models/settingsModel";
import {
    findStoreSettingsRow,
    listDiscountProductRows,
    listDiscountRows,
    listDiscountTierRows,
    listHighlightProductRows,
    listHighlightRows,
} from "@/models/settingsModel";
import { getActiveProductDiscount } from "@/services/settings/discountCalculator";
import { listHighlights } from "@/services/settings/highlightService";
import { resolveCatalogMedia } from "@/services/catalog/catalogMediaService";

// Árvore categoria->subcategorias pro menu público — direto de `classifications`/
// `classification_types` (hierarquia real via `parent_id`, sem heurística de
// nome), já filtrada pelo opt-in do tenant (`active`, ver listCategoryMenuRows).
export async function categoryMenu(
    tenant: Tenant,
): Promise<CategoryTreeEntry[]> {
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

export async function listCatalogFilters(
    tenant: Tenant,
): Promise<CatalogFilters> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const categories = await categoryMenu(tenant);
        const variants = await listProductVariantRows(client);
        const products = await listProductRows(client);
        const visibleProductIds = new Set(
            products
                .filter((product) => hasPublicCatalogPrice(product.price))
                .map((product) => product.id),
        );
        const visibleVariants = variants.filter((variant) =>
            visibleProductIds.has(variant.product_id),
        );

        const allColors = [
            ...new Set(visibleVariants.map((v) => v.color).filter(Boolean)),
        ].sort();
        const allSizes = [
            ...new Set(visibleVariants.map((v) => v.size).filter(Boolean)),
        ].sort((a, b) =>
            isNaN(Number(a)) || isNaN(Number(b))
                ? a.localeCompare(b)
                : Number(a) - Number(b),
        );

        return {
            categories,
            colors: allColors,
            sizes: allSizes,
        };
    });
}

function buildDiscounts(
    discountRows: DiscountRow[],
    tierRows: DiscountTierRow[],
    discountProductRows: DiscountProductRow[],
): Discount[] {
    return discountRows.map((discount) => ({
        id: discount.id,
        label: discount.label,
        active: discount.active,
        type: discount.type,
        percent: Number(discount.percent),
        tiers: tierRows
            .filter((tier) => tier.discount_id === discount.id)
            .map((tier) => ({
                minQty: tier.min_qty,
                percent: Number(tier.percent),
            })),
        productIds: discountProductRows
            .filter((product) => product.discount_id === discount.id)
            .map((product) => product.product_id),
    }));
}

interface CatalogAssociations {
    variants: ProductVariantRow[];
    stockByVariant: Map<string, number>;
    classifications: ClassificationJoinedRow[];
    packs: ProductPackRow[];
    packItems: ProductPackItemRow[];
    colorImages: ProductColorImageRow[];
    storeSettings: StoreSettingsRow | null;
    discounts: Discount[];
}

// Monta os Product[] a partir de linhas já carregadas -- compartilhada pelo
// workspace administrativo (associações do tenant inteiro) e pela página
// pública (listCatalogPage, associações só dos produtos da página), que só
// diferem em QUAIS linhas são carregadas antes de chegar aqui.
async function assembleCatalogProducts(
    productRows: ProductRow[],
    assoc: CatalogAssociations,
): Promise<Product[]> {
    if (productRows.length === 0) return [];
    const {
        variants,
        stockByVariant,
        classifications,
        packs,
        packItems,
        colorImages,
        storeSettings,
        discounts,
    } = assoc;
    const colorImagesByProduct = new Map<string, Record<string, string[]>>();
    for (const row of colorImages) {
        const byColor = colorImagesByProduct.get(row.product_id) ?? {};
        (byColor[row.color] ??= []).push(row.image_url);
        colorImagesByProduct.set(row.product_id, byColor);
    }
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
            stockQty: row.track_inventory
                ? (stockByVariant.get(row.id) ?? 0)
                : undefined,
            classifications: classificationsByVariant.get(row.id) ?? [],
        });
        variantsByProduct.set(row.product_id, productVariants);
    }

    return Promise.all(
        productRows.map(async (row) => {
            const productVariants = variantsByProduct.get(row.id) ?? [];
            const resolvedMedia = await resolveCatalogMedia(row.media);
            const { manualOverride, ...attributes } =
                row.attributes as typeof row.attributes & {
                    manualOverride?: Partial<Product>;
                };
            let product: Product = {
                id: row.id,
                name: row.name,
                description: row.description,
                referenceId: row.reference_id ?? undefined,
                price: Number(row.price),
                suggestedRetailPrice: row.suggested_retail_price
                    ? Number(row.suggested_retail_price)
                    : undefined,
                markup: row.markup ? Number(row.markup) : undefined,
                image: resolvedMedia.image,
                images: resolvedMedia.images,
                imagesByColor: resolvedMedia.imagesByColor,
                galleryByColor: colorImagesByProduct.get(row.id),
                videoUrl: resolvedMedia.videoUrl,
                colors: [
                    ...new Set(productVariants.map((variant) => variant.color)),
                ],
                sizes: [
                    ...new Set(productVariants.map((variant) => variant.size)),
                ],
                variants: productVariants,
                packs: packs
                    .filter((pack) => pack.product_id === row.id)
                    .map((pack) => ({
                        id: pack.id,
                        scope: pack.scope,
                        label: pack.label,
                        color: pack.color ?? undefined,
                        price: Number(pack.price),
                        items: packItems
                            .filter((item) => item.pack_id === pack.id)
                            .map((item) => ({
                                size: item.size,
                                qty: item.quantity,
                                color: item.color ?? undefined,
                            })),
                    })),
                ...attributes,
                ...(row.source_origin === "erp" ? {} : manualOverride),
            } as Product;
            if (
                canApplyDefaultMarkup(row.source_origin) &&
                storeSettings?.default_markup &&
                product.suggestedRetailPrice === undefined &&
                product.markup === undefined
            ) {
                const defaultMarkup = Number(storeSettings.default_markup);
                product = {
                    ...product,
                    suggestedRetailPrice:
                        Math.round(product.price * defaultMarkup * 100) / 100,
                    markup: defaultMarkup,
                };
            }
            const activeDiscount = getActiveProductDiscount(
                product.id,
                discounts,
            );
            if (activeDiscount) product = { ...product, activeDiscount };
            if (storeSettings?.features?.suggestedPrice === false) {
                const withoutSuggestedPrice = { ...product };
                delete withoutSuggestedPrice.suggestedRetailPrice;
                delete withoutSuggestedPrice.markup;
                product = withoutSuggestedPrice;
            }
            return product;
        }),
    );
}

// Catálogo administrativo é deliberadamente completo: o workspace precisa
// editar inclusive produtos ainda sem preço publicável. Ele não é exposto
// pelo endpoint público paginado.
async function loadAdminCatalog(tenant: Tenant): Promise<Product[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const productRows = await listProductRows(client);
        if (productRows.length === 0) return [];

        const variants = await listProductVariantRows(client);
        const classifications = await listVariantClassificationRows(client);
        const packs = await listProductPackRows(client);
        const packItems = await listProductPackItemRows(client);
        const colorImages = await listProductColorImageRows(client);
        const storeSettings = await findStoreSettingsRow(client);
        const discountRows = await listDiscountRows(client);
        const tierRows = await listDiscountTierRows(client);
        const discountProductRows = await listDiscountProductRows(client);
        const stockByVariant = await getStockForVariants(
            tenant,
            client,
            variants.map((variant) => variant.id),
        );
        const discounts = buildDiscounts(
            discountRows,
            tierRows,
            discountProductRows,
        );
        return assembleCatalogProducts(productRows, {
            variants,
            stockByVariant,
            classifications,
            packs,
            packItems,
            colorImages,
            storeSettings,
            discounts,
        });
    });
}

export function canApplyDefaultMarkup(
    sourceOrigin: ProductSourceOrigin,
): boolean {
    return sourceOrigin !== "erp";
}

/**
 * Item usado exclusivamente pelos pickers do Workspace. A lista completa de
 * produtos administrativos inclui variantes, classificações, packs e galerias;
 * enviá-la para cada editor tornava a navegação proporcional ao catálogo.
 */
export interface ProductPickerItem {
    id: string;
    name: string;
    referenceId?: string;
    price: number;
    image?: string;
    activeDiscount?: { label?: string; percent: number } | null;
}

export async function listProductPickerItems(
    tenant: Tenant,
    query: { term?: string; ids?: string[]; limit?: number },
): Promise<ProductPickerItem[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const rows = await listProductPickerRows(client, {
            term: query.term,
            ids: query.ids,
            limit: query.limit ?? 8,
        });
        const discountRows = await listDiscountRows(client);
        const tierRows = await listDiscountTierRows(client);
        const discountProductRows = await listDiscountProductRows(client);
        const discounts = buildDiscounts(
            discountRows,
            tierRows,
            discountProductRows,
        );
        return Promise.all(
            rows.map(async (row) => {
                const media = await resolveCatalogMedia(row.media);
                return {
                    id: row.id,
                    name: row.name,
                    referenceId: row.reference_id ?? undefined,
                    price: Number(row.price),
                    image: media.image,
                    activeDiscount: getActiveProductDiscount(row.id, discounts),
                };
            }),
        );
    });
}

/** Visão exclusiva do workspace, com a origem usada para controlar edição. */
export async function listAdminProducts(
    tenant: Tenant,
): Promise<ProductAdmin[]> {
    const [products, sourceRows] = await Promise.all([
        loadAdminCatalog(tenant),
        withTenantTransaction(tenant, {}, (client) => listProductRows(client)),
    ]);
    const sourceById = new Map(
        sourceRows.map((row) => [row.id, row.source_origin]),
    );
    return products.map((product) => ({
        ...product,
        sourceOrigin: sourceById.get(product.id) ?? "manual",
    }));
}

/**
 * Versão pontual da visão administrativa. Evita montar e assinar as mídias
 * de todo o catálogo quando uma ação acabou de alterar somente um produto.
 */
export async function getAdminProductById(
    tenant: Tenant,
    id: string,
): Promise<ProductAdmin | undefined> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const [row] = await findProductRowsByIds(client, [id]);
        if (!row) return undefined;
        const [product] = await loadAssociatedCatalogProducts(tenant, client, [
            row,
        ]);
        if (!product) return undefined;
        return {
            ...product,
            sourceOrigin: row.source_origin,
        };
    });
}

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

function normalizedPageSize(pageSize?: number): number {
    return Math.min(Math.max(pageSize || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
}

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

function filterCatalogVariants(
    product: Product,
    query: {
        term?: string;
        classificationId?: string;
        color?: string;
        size?: string;
        restrictIds?: string[];
        excludeIds?: string[];
    },
): Product | undefined {
    const term = query.term?.trim().toLowerCase();
    if (
        term &&
        !(product.name || "").toLowerCase().includes(term) &&
        !(product.referenceId || "").toLowerCase().includes(term)
    )
        return undefined;
    // Categorias "dobradas" no menu (ex.: BODY ALCA vira subcategoria de
    // BODY) têm produtos cujo `category` real é o nome dobrado — some do
    // filtro se a gente só comparar contra `subcategory`.
    if (query.restrictIds && !query.restrictIds.includes(product.id))
        return undefined;
    if (query.excludeIds && query.excludeIds.includes(product.id))
        return undefined;
    const variants = product.variants.filter(
        (variant) =>
            (!query.classificationId ||
                variant.classifications.some(
                    (classification) =>
                        classification.id === query.classificationId,
                )) &&
            (!query.color || variant.color === query.color) &&
            (!query.size || variant.size === query.size),
    );
    if (
        (query.classificationId || query.color || query.size) &&
        variants.length === 0
    )
        return undefined;
    const visibleVariants =
        query.classificationId || query.color || query.size
            ? variants
            : product.variants;
    return {
        ...product,
        variants: visibleVariants,
        colors: [...new Set(visibleVariants.map((variant) => variant.color))],
        sizes: [...new Set(visibleVariants.map((variant) => variant.size))],
    };
}

function pickByIds(products: Product[], ids: string[]): Product[] {
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids
        .map((id) => byId.get(id))
        .filter((p): p is Product => Boolean(p));
}

// Mesma regra de featuredProductIds (highlight ∪ desconto ativo do tipo
// "products"), mas a partir das linhas cruas -- não precisa montar Product[]
// do catálogo inteiro só pra saber quais ids excluir (ver getActiveProductDiscount).
function activeProductDiscountIds(
    discountRows: DiscountRow[],
    discountProductRows: DiscountProductRow[],
): Set<string> {
    const activeDiscountIds = new Set(
        discountRows
            .filter((d) => d.active && d.type === "products")
            .map((d) => d.id),
    );
    return new Set(
        discountProductRows
            .filter((dp) => activeDiscountIds.has(dp.discount_id))
            .map((dp) => dp.product_id),
    );
}

// Carrega associações (variantes, estoque, classificações, kits, descontos,
// mídia) só para os produtos dados -- usada pela página real de catálogo
// (listCatalogPage), que já resolveu no SQL quais produtos entram na página
// atual e não precisa mais carregar o tenant inteiro para montá-los.
async function loadAssociatedCatalogProducts(
    tenant: Tenant,
    client: PoolClient,
    productRows: ProductRow[],
): Promise<Product[]> {
    if (productRows.length === 0) return [];
    const productIds = productRows.map((row) => row.id);
    const variants = await listProductVariantRowsByProductIds(
        client,
        productIds,
    );
    const packs = await listProductPackRowsByProductIds(client, productIds);
    const storeSettings = await findStoreSettingsRow(client);
    const discountRows = await listDiscountRows(client);
    const tierRows = await listDiscountTierRows(client);
    const discountProductRows = await listDiscountProductRows(client);
    const variantIds = variants.map((variant) => variant.id);
    const packIds = packs.map((pack) => pack.id);
    const stockByVariant = await getStockForVariants(
        tenant,
        client,
        variantIds,
    );
    const classifications = await listVariantClassificationRowsByVariantIds(
        client,
        variantIds,
    );
    const packItems = await listProductPackItemRowsByPackIds(client, packIds);
    const colorImages = await listProductColorImageRowsByProductIds(
        client,
        productIds,
    );
    const discounts = buildDiscounts(
        discountRows,
        tierRows,
        discountProductRows,
    );
    return assembleCatalogProducts(productRows, {
        variants,
        stockByVariant,
        classifications,
        packs,
        packItems,
        colorImages,
        storeSettings,
        discounts,
    });
}

export async function listCatalogPage(
    tenant: Tenant,
    query: CatalogQuery,
): Promise<CatalogPage> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const excludeFeaturedIds = new Set<string>();
        if (query.excludeFeatured) {
            const highlights = await listHighlights(tenant);
            const discountRows = await listDiscountRows(client);
            const discountProductRows = await listDiscountProductRows(client);
            for (const id of activeProductDiscountIds(
                discountRows,
                discountProductRows,
            ))
                excludeFeaturedIds.add(id);
            for (const highlight of highlights)
                for (const id of highlight.productIds)
                    excludeFeaturedIds.add(id);
        }
        const excludeIds = [
            ...new Set([...(query.excludeIds ?? []), ...excludeFeaturedIds]),
        ];

        if (query.ids) {
            const rows = await findProductRowsByIds(client, query.ids);
            const products = await loadAssociatedCatalogProducts(
                tenant,
                client,
                rows,
            );
            const matching = products
                .map((product) => filterCatalogVariants(product, query))
                .filter((product): product is Product => Boolean(product))
                .filter((product) => !excludeFeaturedIds.has(product.id));
            const items = pickByIds(matching, query.ids);
            return {
                items,
                pagination: {
                    page: 1,
                    pageSize: items.length || 1,
                    total: items.length,
                    totalPages: 1,
                },
            };
        }

        const pageSize = normalizedPageSize(query.pageSize);
        const page = Math.max(query.page || 1, 1);
        const { rows, total } = await listCatalogProductPage(client, {
            term: query.term,
            classificationId: query.classificationId,
            color: query.color,
            size: query.size,
            restrictIds: query.restrictIds,
            excludeIds,
            limit: pageSize,
            offset: (page - 1) * pageSize,
        });
        const products = await loadAssociatedCatalogProducts(
            tenant,
            client,
            rows,
        );
        const items = products
            .map((product) => filterCatalogVariants(product, query))
            .filter((product): product is Product => Boolean(product));
        return {
            items,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.max(Math.ceil(total / pageSize), 1),
            },
        };
    });
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

// O chamador escolhe entre uma página (listCatalogPage) e o conjunto completo
// (esta função). `MAX_PAGE_SIZE` é apenas o lote físico de cada consulta; o
// loop continua até a última página, sem cortar produtos do resultado final.
// O mesmo filtro do motor paginado pode ser aplicado ao snapshot completo.
export async function listCatalogSnapshot(
    tenant: Tenant,
    query: Omit<CatalogQuery, "page" | "pageSize"> = {},
): Promise<Product[]> {
    const items: Product[] = [];
    let page = 1;
    while (true) {
        const result = await listCatalogPage(tenant, {
            ...query,
            page,
            pageSize: MAX_PAGE_SIZE,
        });
        items.push(...result.items);
        if (page >= result.pagination.totalPages) return items;
        page += 1;
    }
}

export async function listCatalogSections(
    tenant: Tenant,
    query: CatalogSectionsQuery,
): Promise<CatalogSectionsResult> {
    // A implementação anterior montava cada produto/variante do tenant em
    // memória e só depois fatiava a grade. Além de ignorar o
    // motor paginado, isso carregava centenas de URLs de mídia e saldos para
    // entregar somente 24 cards. Aqui os IDs destacados determinam a pequena
    // vitrine e a grade usa a mesma listCatalogPage de GET /api/catalog.
    const pageSize = normalizedPageSize(query.pageSize);
    return withTenantTransaction(tenant, {}, async (client) => {
        // A rota é composta no mesmo escopo/transaction do motor de página:
        // uma consulta escolhe os produtos da grade (LIMIT/OFFSET no SQL) e
        // uma única carga de associações monta os cards da grade e vitrines.
        // Evita tanto o catálogo inteiro quanto duas cargas idênticas de
        // variantes, mídia, estoque e configurações.
        const highlightRows = await listHighlightRows(client);
        const highlightProductRows = await listHighlightProductRows(client);
        const highlights = highlightRows.map((highlight) => ({
            id: highlight.id,
            label: highlight.label,
            productIds: highlightProductRows
                .filter((product) => product.highlight_id === highlight.id)
                .map((product) => product.product_id),
            showInCatalog: highlight.show_in_catalog,
        }));
        const discountRows = await listDiscountRows(client);
        const discountProductRows = await listDiscountProductRows(client);

        // Highlights ocultos continuam fora de "outros produtos", como antes.
        // Eles entram nesta consulta somente para que o total de `all` permaneça
        // correto sem precisar consultar o catálogo inteiro.
        const featuredIds = new Set<string>(
            activeProductDiscountIds(discountRows, discountProductRows),
        );
        for (const highlight of highlights)
            for (const id of highlight.productIds) featuredIds.add(id);
        const excludedIds = [
            ...new Set([...(query.excludeIds ?? []), ...featuredIds]),
        ];

        const featuredRows =
            featuredIds.size > 0
                ? await findProductRowsByIds(client, [...featuredIds])
                : [];
        const outrosPage = await listCatalogProductPage(client, {
            term: query.term,
            classificationId: query.classificationId,
            color: query.color,
            size: query.size,
            restrictIds: query.restrictIds,
            excludeIds: excludedIds,
            limit: pageSize,
            offset: 0,
        });
        const productRows = [
            ...new Map(
                [...featuredRows, ...outrosPage.rows].map((row) => [
                    row.id,
                    row,
                ]),
            ).values(),
        ];
        const products = await loadAssociatedCatalogProducts(
            tenant,
            client,
            productRows,
        );
        const productById = new Map(
            products.map((product) => [product.id, product]),
        );
        const matching = pickByIds(products, [...featuredIds])
            .map((product) => filterCatalogVariants(product, query))
            .filter((product): product is Product => Boolean(product));
        const outros = {
            items: outrosPage.rows
                .map((row) => productById.get(row.id))
                .map(
                    (product) =>
                        product && filterCatalogVariants(product, query),
                )
                .filter((product): product is Product => Boolean(product)),
            pagination: {
                page: 1,
                pageSize,
                total: outrosPage.total,
                totalPages: Math.max(Math.ceil(outrosPage.total / pageSize), 1),
            },
        };
        const highlightSections = highlights
            .filter((h) => h.showInCatalog)
            .map((h) => ({
                id: h.id,
                label: h.label,
                items: pickByIds(matching, h.productIds),
            }));
        const promoSection = {
            id: "promocoes",
            label: "Promoções",
            items: matching.filter((p) => !!p.activeDiscount),
        };
        const sections = [...highlightSections, promoSection].filter(
            (s) => s.items.length > 0,
        );
        const allTotal = matching.length + outros.pagination.total;
        const allPagination = {
            page: 1,
            pageSize,
            total: allTotal,
            totalPages: Math.max(Math.ceil(allTotal / pageSize), 1),
        };
        const showSections =
            sections.length + (outros.pagination.total > 0 ? 1 : 0) > 1;

        if (showSections) {
            // CatalogApp escolhe `outros` neste modo. Não devolvemos uma segunda
            // cópia dos mesmos cards em `all`, que antes respondia por boa parte
            // dos ~760 KB da carga inicial.
            return {
                sections,
                all: { items: [], pagination: allPagination },
                outros,
            };
        }

        // Sem vitrines suficientes a UI usa `all`; esse caminho incomum mantém
        // a mesma página inicial pelo motor compartilhado.
        const all = await listCatalogPage(tenant, query);
        return { sections, all, outros };
    });
}
