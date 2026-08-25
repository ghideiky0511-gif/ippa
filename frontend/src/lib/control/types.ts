export type TenantStatus = 'active' | 'inactive' | 'archived';
export type PlatformPlanCode = 'trial' | 'essential' | 'professional' | 'enterprise';
export type TenantContractStatus = 'draft' | 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled' | 'expired';
export type TenantContractBillingCycle = 'monthly' | 'annual' | 'custom';

export interface ControlTenantUser {
  id: string;
  name: string;
  email: string;
  role: 'administrador' | 'vendedora' | 'expedicao' | 'entregador' | 'cliente';
  active: boolean;
  createdAt: string;
}

export interface ControlTenantContract {
  id: string;
  plan: { code: PlatformPlanCode; name: string };
  status: TenantContractStatus;
  billingCycle: TenantContractBillingCycle;
  currency: string;
  priceCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  externalReference: string | null;
}

export interface ControlTenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  active: boolean;
  createdAt: string;
  userCount: number;
  contract: ControlTenantContract | null;
}
