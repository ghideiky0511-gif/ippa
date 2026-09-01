-- Log append-only de callbacks de status de mensagem recebidos da Meta
-- (sent/delivered/read/failed) -- mesmo espírito de payment_webhook_events
-- (migration 044): guarda "o que aconteceu", cru, com idempotência.
-- tenant_id fica nullable pelo mesmo motivo de lá: a rota de webhook não tem
-- tenant na URL (a Meta manda tudo para um único endpoint por app), o
-- tenant só é identificável depois de olhar `phone_number_id` dentro do
-- payload -- um evento não identificável ainda é logado, com
-- signature_valid=false e processing_error preenchido.

CREATE TABLE whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  wa_message_id text,
  event_type text NOT NULL,
  signature_valid boolean NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_webhook_events_message_idx
  ON whatsapp_webhook_events (tenant_id, wa_message_id, created_at DESC);

-- Idempotência: a Meta reentrega o mesmo evento em retry de rede (garantia
-- "at-least-once" documentada nos webhooks do Graph API) -- sem isso, um
-- reenvio duplicaria a linha. Parcial porque wa_message_id pode ser nulo
-- num evento malformado/não reconhecido, que não tem chave natural.
CREATE UNIQUE INDEX whatsapp_webhook_events_dedupe_idx
  ON whatsapp_webhook_events (wa_message_id, event_type) WHERE wa_message_id IS NOT NULL;

ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON whatsapp_webhook_events FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

-- Append-only, igual payment_webhook_events: sem UPDATE nem DELETE para a
-- aplicação -- só processed_at/processing_error, escritos por um novo
-- INSERT, nunca por edição da linha original.
GRANT SELECT, INSERT ON whatsapp_webhook_events TO ippa_app;
