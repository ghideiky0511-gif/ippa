import { z } from 'zod';
import { adminJsonServer } from './httpServer';
import type { PaymentIntegrationOption } from './paymentIntegrationClient';

// Pagamento fica fora do escopo da validação Zod na fronteira da API (mesmo
// tradeoff aceito para ERP, ver erpIntegrationClient.server.ts).
export function fetchPaymentIntegrations(): Promise<{ options: PaymentIntegrationOption[] }> {
  return adminJsonServer('/api/payment-integration', z.unknown(), {}, 'Não foi possível carregar os provedores de pagamento.') as Promise<{ options: PaymentIntegrationOption[] }>;
}
