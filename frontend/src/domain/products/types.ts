/** Dados de produto recebidos do catálogo e usados no carrinho. */
export type Availability = 'in_stock' | 'preorder' | 'backorder' | 'out_of_stock';

export interface Variant { id: string; color: string; size: string; price: number; availability: Availability; availableFrom?: string; stockQty?: number; }
export type PackScope = 'grade' | 'pack';
export interface PackItem { size: string; qty: number; color?: string; }
export interface Pack { id: string; scope: PackScope; label: string; color?: string; price: number; items: PackItem[]; }
export interface Product {
  id: string; name: string; description: string; category: string; subcategory?: string; collection?: string; brand?: string; sku?: string;
  price: number; image?: string; images?: string[]; imagesByColor?: Record<string, string>; colors: string[]; sizes: string[]; variants: Variant[];
  videoUrl?: string; suggestedRetailPrice?: number; markup?: number; relatedProductIds?: string[]; packs?: Pack[];
  similarProductIdsQuickview?: string[]; similarProductIdsCart?: string[]; activeDiscount?: { label: string; percent: number };
}
