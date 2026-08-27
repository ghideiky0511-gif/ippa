import type { Product } from '@/domain/products/types';

export function productClassificationSummary(product: Product): string {
  const names = [...new Set(product.variants.flatMap((variant) => variant.classifications
    .filter((classification) => classification.type.categoryLevel !== undefined)
    .map((classification) => classification.name)))];
  return names.slice(0, 3).join(' / ');
}

export function variantClassificationIds(product: Product, variantId: string): string[] {
  return product.variants.find((variant) => variant.id === variantId)?.classifications.map((classification) => classification.id) ?? [];
}
