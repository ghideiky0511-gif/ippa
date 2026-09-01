-- Stripe Connect (Express, direct charges, application fee) -- primeiro
-- provider real de pagamento (mock continua fixture, hidden no catálogo).
-- Modelo marketplace: quem recebe do cliente final é o tenant (connected
-- account), não a plataforma -- a chave secreta da API é única, da
-- plataforma (STRIPE_SECRET_KEY, env), não por tenant. O que varia por
-- tenant é o stripe_account_id (acct_xxx) e o status do onboarding
-- hospedado (Account Links). Ver backend/src/payments/providers/stripe/ e
-- services/payments/{stripeOnboardingService,stripeWebhookService,
-- paymentChargeService}.ts.

ALTER TABLE tenant_payment_integrations
  ADD COLUMN stripe_account_id text,
  ADD COLUMN stripe_onboarding_status text
    CHECK (stripe_onboarding_status IN ('pending', 'complete', 'restricted'));

-- Único no sistema inteiro (não só por tenant): um acct_xxx nunca pertence a
-- dois tenants -- é também a chave que o webhook usa pra achar o tenant
-- (ver stripeWebhookService.ts) sem decifrar credentials_encrypted.
CREATE UNIQUE INDEX tenant_payment_integrations_stripe_account_idx
  ON tenant_payment_integrations (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- Dedup/observabilidade de webhook: NÃO único de propósito -- uma
-- redelivery de um evento que falhou antes grava uma NOVA linha (ver
-- stripeWebhookService.ts), nunca faz UPDATE na antiga (a tabela só tem
-- GRANT INSERT pra ippa_app, é append-only, ver migration 044).
CREATE INDEX payment_webhook_events_external_event_idx
  ON payment_webhook_events (tenant_id, provider, external_event_id)
  WHERE external_event_id IS NOT NULL;

-- Mesmo padrão de migration 039 (catalog_sync_configs/states) pra
-- ippa_control: permite achar o tenant pelo stripe_account_id ANTES de
-- abrir transação de tenant (o webhook do Stripe não tem tenant na URL, só
-- `event.account` no payload) e enumerar cobranças pendentes de
-- reconciliação entre todos os tenants -- sem dar BYPASSRLS pra ippa_app.
GRANT SELECT ON tenant_payment_integrations TO ippa_control;
GRANT SELECT ON payment_charges TO ippa_control;
-- Só pro caso "evento não identificável" (ver comentário em migration 044
-- sobre tenant_id nullable em payment_webhook_events -- até aqui nunca
-- exercitado, porque a policy tenant_id = app_tenant_id() torna impossível
-- gravar tenant_id NULL via ippa_app). Todo resto grava via ippa_app depois
-- de resolver o tenant, ver stripeWebhookService.ts.
GRANT INSERT ON payment_webhook_events TO ippa_control;
