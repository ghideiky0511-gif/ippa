/** Itens de venda, sessões de talão, frete e pedidos fechados. */
export type OrderChannel = 'presencial' | 'whatsapp' | 'online';
export type OrderSessionStatus = 'aberto' | 'fechado' | 'aguardando_pagamento' | 'cancelado';
export interface CartItem { key: string; id: string; name: string; image?: string; color?: string; size?: string; price: number; qty: number; stockQty?: number; backorderDate?: string; }
export interface ShippingOption { id: string; label: string; price: number; prazo: string; }
export interface OrderSession {
  id: string; orderBookId: string; clientName: string; clientId?: string; sellerId: string; channel: OrderChannel; items: CartItem[];
  shipping?: ShippingOption; status: OrderSessionStatus; paymentToken?: string; paymentTokenCreatedAt?: string;
  notes?: string; createdAt: string; updatedAt: string; sellerName?: string;
}
export interface OrderBook {
  id: string; sellerId: string; name: string; status: 'aberto' | 'fechado'; isActive: boolean;
  createdAt: string; updatedAt: string;
}
export interface Order {
  id: string; date: string; items: CartItem[]; total: number; channel: string; shipping?: ShippingOption; paymentMethod?: string;
  discount?: { label: string; amount: number }; clientId?: string; sellerId?: string; clientName?: string;
}
