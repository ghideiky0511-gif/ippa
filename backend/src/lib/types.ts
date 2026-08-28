// Tipos de Pedidos, Clientes, Catálogo, Produtos e Tenant migraram pra
// backend/src/contracts/*.ts (fonte única, compartilhada com o frontend
// via scripts/sync-contracts.mjs — ver frontend/src/contracts/*.ts). Este
// arquivo continua sendo o import path que o resto do backend já usa
// (@/lib/types); só reexporta em vez de definir.
export type { Availability, Variant, PackScope, PackItem, Pack, Product } from '@/contracts/products';
export type {
  CartItem, FreightProviderKind, FreightQuote, SessionFreight, OrderFreight, OrderFreightMethod, OrderFreightStatus,
  DeliveryFulfillmentMode, DeliveryProviderKind, DeliveryPricingMode,
  DeliveryProvider, DeliveryOffering, DeliveryType, UpdateDeliveryTypeInput, DeliveryQuote,
} from '@/contracts/shared';
export type { Client } from '@/contracts/clients';
export type {
  CommercialGroup, CommercialGroupType, CommercialGroupMember,
  CommercialGroupMemberWithClient, CommercialGroupWithMembers, ErpRelatedParty,
} from '@/contracts/commercialGroups';
export type {
  AuthPermissions, AuthUser, CatalogArea, UserRole,
  UserCredentials, ClientRegistration, ClientRegistrationUpdate,
} from '@/contracts/auth';
export type {
  ClassificationEntry, DiscountType, HomeSectionType, BannerMediaType, AssignmentStrategy,
  DiscountTier, Discount, Highlight, Audience, Banner, HomeSection, HomeSectionCta, BreakpointLayout, ResolvedHomeSection,
  CategoryTreeEntry, SimilarProductsRuleConfig, SimilarProductsSettings,
  ProductOverride, ProductOverrides, StoreFeatures, StoreSettings, HomeAiHistoryItem,
} from '@/contracts/catalog';
export type {
  CategoryLevel, Classification, ClassificationType, CategoryTreeNode,
  CategoryHierarchyMapping, ErpClassificationTypeOption,
} from '@/contracts/classifications';
export type {
  OrderChannel, OrderSession, OrderSessionParticipant, OrderSessionParticipantRole,
  OrderSessionParticipantUser, OrderBook, OrderStatus, Order,
} from '@/contracts/orders';

// Enums de estoque (Bippa/ERP) — ainda sem contrato compartilhado com o
// frontend (nenhuma tela consome isso hoje), fica só no backend por
// enquanto.
export type InventoryLocationKind = 'warehouse' | 'store' | 'virtual';
export type InventorySourceKind = 'manual' | 'erp' | 'marketplace';
export type InventoryMovementType = 'initial' | 'receipt' | 'sale' | 'return' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'reservation' | 'release' | 'integration_sync';
export type InventoryReservationStatus = 'active' | 'released' | 'consumed' | 'expired';

// Filial/multi-empresa dentro do ERP de um tenant (matriz + filiais, cada
// uma com seu CNPJ) — não confundir com Tenant (a loja no SaaS, ver
// @/contracts/tenant) nem com Client.companyResponsible/storeName (texto
// livre da empresa da cliente). Fonte de dado é o motor de integração ERP
// (ver backend/src/erp/), sem UI de edição própria ainda.
export interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  inscricaoEstadual?: string;
  isMatriz: boolean;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
