// Hierarquia de fontes de imagem, da mais específica pra mais genérica:
//   - product.galleryByColor: { COR: [url, url, ...] } -> galeria da cor
//     escolhida (tabela product_color_images) — várias fotos, SÓ daquela cor.
//   - product.images: [url, url, ...]        -> galeria única (sem filtro
//     por cor) usada quando a cor escolhida não tem galeria própria.
//   - product.imagesByColor: { COR: url }    -> 1 foto específica por cor.
// Enquanto nenhum desses campos existe, cai tudo no product.image mesmo.

import type { Product } from "./types";

export function resolveGallery(product: Product, color?: string | null): string[] {
    if (color && product.galleryByColor?.[color]?.length) return product.galleryByColor[color];
    if (Array.isArray(product.images) && product.images.length)
        return product.images;
    return product.image ? [product.image] : [];
}

export function resolveImageForColor(
    product: Product,
    color?: string | null,
): string | null {
    if (product.imagesByColor && color && product.imagesByColor[color]) {
        return product.imagesByColor[color];
    }
    return product.image || null;
}
