import { z } from 'zod';
import { adminJsonServer } from './httpServer';
import type { ErpIntegrationOption } from './erpIntegrationClient';

// ERP fica fora do escopo da validação Zod na fronteira da API — z.unknown()
// só preserva o comportamento de hoje (sem validar a resposta) pra
// continuar compilando com a nova assinatura de adminJsonServer.
export function fetchErpIntegrations(): Promise<{ options: ErpIntegrationOption[] }> {
  return adminJsonServer('/api/erp-integration', z.unknown(), {}, 'Não foi possível carregar os provedores de ERP.') as Promise<{ options: ErpIntegrationOption[] }>;
}
