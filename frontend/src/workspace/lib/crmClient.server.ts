import { z } from 'zod';
import { CrmInboxSchema, type CrmInbox } from '@/domain/crm/types';
import { adminJsonServer } from './httpServer';

// Só para uso em Server Components -- ver crmClient.ts (versão client-side,
// mesma convenção de customersClient.server.ts/customersClient.ts).
export function fetchCrmInboxes(): Promise<CrmInbox[]> {
  return adminJsonServer('/api/crm/inboxes', z.array(CrmInboxSchema), {}, 'Não foi possível carregar os números de WhatsApp.');
}
