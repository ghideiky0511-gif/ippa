// O feed atual só traz uma foto por produto (product.image). Este helper já
// deixa o componente pronto pra quando existir mais de uma imagem e/ou uma
// imagem por cor, sem precisar mexer no componente de novo:
//   - product.images: [url, url, ...]        -> galeria de fotos do produto
//   - product.imagesByColor: { COR: url }    -> foto específica por cor
// Enquanto esses campos não existem, cai tudo no product.image mesmo.

import type { Product } from './types';

export function resolveGallery(product: Product): string[] {
  if (Array.isArray(product.images) && product.images.length) return product.images;
  return product.image ? [product.image] : [];
}

export function resolveImageForColor(product: Product, color?: string | null): string | null {
  if (product.imagesByColor && color && product.imagesByColor[color]) {
    return product.imagesByColor[color];
  }
  return product.image || null;
}
