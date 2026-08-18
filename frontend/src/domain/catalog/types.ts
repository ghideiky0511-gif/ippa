import type { Product } from '@/domain/products/types';

export interface DiscountTier { minQty: number; percent: number; }
export interface Discount { id: string; label: string; active: boolean; type: 'quantity' | 'products'; tiers: DiscountTier[]; productIds: string[]; percent: number; }
export interface Highlight { id: string; label: string; productIds: string[]; }
export interface Audience { id: string; label: string; productIds: string[] | null; }
export interface Banner { id: string; type: 'image' | 'video'; mediaUrl: string; title?: string; subtitle?: string; }
export type HomeSection =
  | { type: 'banner'; id: string; banners: Banner[]; x?: number; y?: number; width?: number; height?: number }
  | { type: 'product'; id: string; productId: string; x?: number; y?: number; width?: number; height?: number };
export type ResolvedHomeSection = HomeSection & { product?: Product };
export interface CategoryTreeEntry { category: string; subcategories: string[]; }
export interface SimilarProductsRuleConfig { limit: number; rules: string[]; }
export interface SimilarProductsSettings { quickview: SimilarProductsRuleConfig; cart: SimilarProductsRuleConfig; complementaryCategories: Record<string, string[]>; }
export interface ProductOverride {
  sku?: string;
  suggestedRetailPrice?: number;
  markup?: number;
  category?: string;
  subcategory?: string;
  collection?: string;
  similarProductIdsQuickview?: string[];
  similarProductIdsCart?: string[];
}
export type ProductOverrides = Record<string, ProductOverride>;
export interface StoreSettings {
  defaultMarkup?: number;
  paymentLinkExpirationMinutes?: number;
  assignmentStrategy?: 'leastBusy' | 'roundRobin' | 'any';
  features?: Record<string, boolean>;
}
export interface HomeAiHistoryItem {
  prompt: string;
  sections: HomeSection[];
  createdAt?: string;
}
