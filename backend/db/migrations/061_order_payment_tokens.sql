-- Token de pagamento por PEDIDO -- diferente de order_sessions.payment_token_hash
-- (migration 002), que autentica o link de FINALIZAÇÃO de checkout remoto
-- (paymentService.ts::confirmPayment, pedido ainda nem existe como 'novo').
-- Este aqui autentica o link de COBRANÇA real (Stripe) de um pedido que já
-- existe e já foi separado -- gerado por orderPaymentLinkService.ts,
-- consumido em /pagar/[token] ao lado do token de sessão existente.
ALTER TABLE orders
  ADD COLUMN payment_token_hash text UNIQUE,
  ADD COLUMN payment_token_created_at timestamptz;
