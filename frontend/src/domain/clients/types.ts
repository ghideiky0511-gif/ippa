import type { CartItem } from '@/domain/orders/types';

export type UserRole = 'administrador' | 'vendedora' | 'expedicao' | 'entregador' | 'cliente';
export interface AuthUser { id: string; email: string; name: string; role: UserRole; clientId?: string; permissions?: { adminAccess?: boolean; catalogAreas?: string[] }; }
export interface Client {
  id: string; name: string; cpfCnpj?: string; email?: string; cep?: string; street?: string; number?: string; complement?: string;
  neighborhood?: string; city?: string; state?: string; companyResponsible?: string; storeName?: string; cart?: CartItem[];
  cartUpdatedAt?: string; lastSellerId?: string; createdAt: string; updatedAt: string;
}
