-- A análise operacional da última compra lê somente pedidos pagos: um índice
-- para o histórico da cliente e outro para a amostra geral do tenant evitam
-- varrer pedidos em aberto, novos, separados ou cancelados.
CREATE INDEX IF NOT EXISTS orders_tenant_client_paid_created_idx
  ON orders (tenant_id, client_id, created_at DESC)
  WHERE status = 'pago';

CREATE INDEX IF NOT EXISTS orders_tenant_paid_created_idx
  ON orders (tenant_id, created_at DESC)
  WHERE status = 'pago';
