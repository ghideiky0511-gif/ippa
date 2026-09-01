-- A integração passa a criar e gerenciar connected accounts somente pela
-- Accounts API v2. Remove os vínculos v1 locais: as contas reais continuam
-- existentes no Dashboard Stripe, mas não ficam mais associadas a tenants.
ALTER TABLE tenant_payment_integrations
  ADD COLUMN stripe_api_version text
    CHECK (stripe_api_version = 'v2');

UPDATE tenant_payment_integrations
   SET stripe_account_id = NULL,
       stripe_onboarding_status = NULL,
       stripe_api_version = NULL,
       active = false,
       updated_at = now()
 WHERE provider = 'stripe'
   AND stripe_account_id IS NOT NULL;
