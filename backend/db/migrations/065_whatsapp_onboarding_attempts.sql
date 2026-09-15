-- Estado local durável de cada tentativa de Embedded Signup aberta no
-- bippa-messaging (ver backend/src/services/whatsapp/whatsappOnboardingService.ts).
-- Sem esta tabela, a única forma de saber se um onboarding terminou era o
-- postMessage do popup -- se o evento se perdesse ou o popup fechasse antes,
-- não havia como reconciliar. Agora o `attempt_id` (gerado pelo
-- bippa-messaging) é persistido assim que a tentativa é aberta, e o backend
-- consulta `GET /v1/admin/onboarding/attempts/:attempt_id` para reconciliar o
-- estado real -- o evento do popup só acelera a primeira consulta.
--
-- NUNCA guarda `state` (token de uso único do popup, efêmero por natureza) --
-- só o suficiente para resolver "esta tentativa pertence a este tenant e
-- vendedora" e para renderizar o resultado (result_connection/result_phones)
-- depois de completed.
CREATE TABLE whatsapp_onboarding_attempts (
  -- Mesmo UUID que o bippa-messaging atribuiu à tentativa (attempt_id) --
  -- não gerado aqui, para que a consulta de reconciliação seja uma busca
  -- direta por chave primária.
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- "<tenant_id>:<seller_id>" -- o mesmo valor usado em provisionamento,
  -- início e consulta desta tentativa no bippa-messaging (source_reference).
  source_reference text NOT NULL,
  destination_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_code text,
  error_message text,
  -- `result.connection` e `result.phones` da resposta de
  -- GET /v1/admin/onboarding/attempts/:id quando status = completed --
  -- guardado para a UI renderizar os telefones sem precisar de uma segunda
  -- chamada. Nunca contém token/credencial da Meta (o contrato de
  -- `result` não inclui isso).
  result jsonb,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_onboarding_attempts_tenant_seller_idx
  ON whatsapp_onboarding_attempts (tenant_id, seller_id, created_at DESC);

ALTER TABLE whatsapp_onboarding_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_onboarding_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON whatsapp_onboarding_attempts FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_onboarding_attempts TO ippa_app;
