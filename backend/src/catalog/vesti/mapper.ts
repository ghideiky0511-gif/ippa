// Leitura e normalização do feed XML público da Vesti — porta interpretar_xml
// de catalog_feed.py. O feed segue o formato Google Merchant (namespace
// "g:"), por isso os campos são lidos pelo prefixo de tag como no original.

import { XMLParser } from "fast-xml-parser";

export interface VestiExternalProduct {
    ref: string;
    name: string;
    catalogTitle: string;
    externalCategory: string;
    productUrl: string;
    imageUrl: string;
    /** Imagem principal seguida de todas as additional_image_link do feed. */
    imageUrls: string[];
    /** Vídeos publicados indevidamente como additional_image_link no feed. */
    videoUrls: string[];
    brand: string;
    active: boolean;
}

export interface VestiExternalVariant {
    ref: string;
    productCode: string;
    color: string;
    size: string;
    price?: number;
    salePrice?: number;
    availability: string;
    imageUrl: string;
    active: boolean;
}

export interface VestiCatalogFeed {
    products: VestiExternalProduct[];
    variants: VestiExternalVariant[];
}

const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
    isArray: (name) => name === "item",
});

function textOfTag(item: Record<string, unknown>, ...tags: string[]): string {
    for (const tag of tags) {
        const valor = item[tag];
        if (typeof valor === "string" && valor.trim()) return valor.trim();
    }
    return "";
}

function textValuesOfTag(item: Record<string, unknown>, ...tags: string[]): string[] {
    const values: string[] = [];
    for (const tag of tags) {
        const value = item[tag];
        const candidates = Array.isArray(value) ? value : [value];
        for (const candidate of candidates) {
            if (typeof candidate === "string" && candidate.trim()) values.push(candidate.trim());
        }
    }
    return values;
}

function uniqueUrls(urls: string[]): string[] {
    return Array.from(new Set(urls.filter(Boolean)));
}

function isVideoUrl(value: string): boolean {
    try {
        return /\.(?:mp4|m4v|mov|webm)$/i.test(new URL(value).pathname);
    } catch {
        return false;
    }
}

function parsePrice(valor: string): number | undefined {
    const token = String(valor || "").trim().split(" ")[0].replace(",", ".");
    if (!token) return undefined;
    const numero = Number(token);
    return Number.isFinite(numero) ? numero : undefined;
}

function isAvailable(availability: string): boolean {
    const token = String(availability || "").trim().toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
    return token === "in_stock" || token === "available" || token === "instock";
}

export function parseVestiCatalogFeed(xmlContent: string): VestiCatalogFeed {
    const root = parser.parse(xmlContent) as Record<string, unknown>;
    const channel = (root?.rss as Record<string, unknown>)?.channel as Record<string, unknown> | undefined;
    const items = (channel?.item as Record<string, unknown>[] | undefined) ?? [];

    const productsByRef = new Map<string, VestiExternalProduct>();
    const variants: VestiExternalVariant[] = [];

    for (const item of items) {
        const productCode = textOfTag(item, "g:id");
        const ref = textOfTag(item, "g:item_group_id") || productCode;
        if (!productCode || !ref) continue;

        const title = textOfTag(item, "g:title");
        const category = textOfTag(item, "g:google_product_category");
        const link = textOfTag(item, "g:link");
        const image = textOfTag(item, "g:image_link");
        const mediaUrls = uniqueUrls([
            image,
            ...textValuesOfTag(item, "g:additional_image_link", "additional_image_link"),
        ]);
        const imageUrls = mediaUrls.filter((url) => !isVideoUrl(url));
        const videoUrls = mediaUrls.filter(isVideoUrl);
        const brand = textOfTag(item, "g:brand");
        const color = textOfTag(item, "g:color", "color");
        const size = textOfTag(item, "g:size", "size");
        const availability = textOfTag(item, "g:availability").toLowerCase() || "unknown";
        const price = parsePrice(textOfTag(item, "g:price"));
        const salePrice = parsePrice(textOfTag(item, "g:sale_price"));

        const existingProduct = productsByRef.get(ref);
        if (!existingProduct) {
            productsByRef.set(ref, {
                ref,
                name: title,
                catalogTitle: title,
                externalCategory: category,
                productUrl: link,
                imageUrl: image,
                imageUrls,
                videoUrls,
                brand,
                active: true,
            });
        } else {
            // O feed costuma repetir a galeria em cada variante; unimos as
            // URLs para também cobrir feeds que a distribuem entre variantes.
            existingProduct.imageUrls = uniqueUrls([...existingProduct.imageUrls, ...imageUrls]);
            existingProduct.videoUrls = uniqueUrls([...existingProduct.videoUrls, ...videoUrls]);
        }

        variants.push({
            ref,
            productCode,
            color,
            size,
            price,
            salePrice,
            availability,
            imageUrl: image,
            active: isAvailable(availability),
        });
    }

    return { products: Array.from(productsByRef.values()), variants };
}
