import { TenantSchema, type Tenant } from '@/contracts/tenant';

export { TenantSchema };

// GET /api/tenant não devolve o `id` interno pro cliente — só o que a UI
// precisa pra exibir (slug/name). Ver backend/src/contracts/tenant.ts.
export type TenantProfile = Omit<Tenant, 'id'>;
export const TenantProfileSchema = TenantSchema.omit({ id: true });
