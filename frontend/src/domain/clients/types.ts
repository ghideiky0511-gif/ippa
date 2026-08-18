import type { CartItem } from '@/domain/orders/types';

export type UserRole = 'administrador' | 'vendedora' | 'expedicao' | 'entregador' | 'cliente';
export interface AuthUser { id: string; email: string; name: string; role: UserRole; clientId?: string; permissions?: { adminAccess?: boolean; catalogAreas?: string[] }; }
export interface Client {
  id: string; name: string; cpfCnpj?: string; email?: string; cep?: string; street?: string; number?: string; complement?: string;
  neighborhood?: string; city?: string; state?: string; companyResponsible?: string; storeName?: string; cart?: CartItem[];
  cartUpdatedAt?: string; lastSellerId?: string; createdAt: string; updatedAt: string;
}
export interface AdminUser extends AuthUser {
  cpfCnpj?: string;
  clientEmail?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  companyResponsible?: string;
  storeName?: string;
  createdAt?: string;
}
export type CatalogArea = 'talao' | 'pedidos';
export interface UserCredentials {
  name: string;
  email: string;
  password?: string;
  catalogAreas?: CatalogArea[];
}
export interface ClientRegistration extends UserCredentials {
  password: string;
  cpfCnpj?: string;
  clientEmail?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  companyResponsible?: string;
  storeName?: string;
}
