import { adminJsonServer } from './httpServer';
import type { ErpIntegrationOption } from './erpIntegrationClient';

export function fetchErpIntegrations(): Promise<{ options: ErpIntegrationOption[] }> {
  return adminJsonServer('/api/erp-integration', {}, 'Não foi possível carregar os provedores de ERP.');
}
