-- Mercado Pago Split Payments (marketplace via OAuth, application_fee) --
-- segundo provider real de pagamento, mesmo modelo marketplace do Stripe
-- Connect (migration 058): quem recebe do cliente final é o tenant (a
-- conta MP conectada), não a plataforma. Diferente do Stripe, aqui NÃO
-- existe uma chave única da plataforma que cobre todo tenant -- o OAuth
-- devolve um access_token/refresh_token por tenant, que são segredo de
-- verdade e vão cifrados em credentials_encrypted (já existente,
-- reaproveitado como está). As duas colunas abaixo são só o que não é
-- segredo: mercadopago_user_id (exibição/integridade) e
-- mercadopago_public_key (não secreto, usado pelo frontend pra iniciar os
-- Bricks). Ver backend/src/payments/providers/mercadopago/ e
-- services/payments/{mercadoPagoOnboardingService,mercadoPagoWebhookService,
-- providerCredentials}.ts.

ALTER TABLE tenant_payment_integrations
  ADD COLUMN mercadopago_user_id text,
  ADD COLUMN mercadopago_public_key text;

-- Único no sistema inteiro, mesmo raciocínio de stripe_account_id
-- (migration 058): uma conta MP nunca pertence a dois tenants. Diferente
-- da Stripe, esta coluna NÃO participa da resolução de tenant do webhook
-- (o payload do Mercado Pago não traz um id de conta inline) -- é só
-- exibição/integridade, ver mercadoPagoWebhookService.ts.
CREATE UNIQUE INDEX tenant_payment_integrations_mercadopago_user_idx
  ON tenant_payment_integrations (mercadopago_user_id)
  WHERE mercadopago_user_id IS NOT NULL;

-- Nenhum GRANT novo necessário: a migration 058 já concedeu
-- GRANT SELECT ON tenant_payment_integrations, payment_charges TO ippa_control,
-- que é o que mercadoPagoWebhookService.ts usa pra resolver o tenant via
-- payment_charges (provider, external_id) antes de abrir transação de tenant.
