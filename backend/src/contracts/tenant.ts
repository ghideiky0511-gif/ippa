import { z } from 'zod';

// Loja no SaaS (multi-tenant) — não confundir com Company (filial de ERP,
// ver backend/src/models/companiesModel.ts). Fonte de verdade é
// backend/src/lib/db/tenant.ts (usado pra roteamento de banco); este
// contrato espelha só o shape que trafega pra fora do backend.
export const TenantSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});
export type Tenant = z.infer<typeof TenantSchema>;
