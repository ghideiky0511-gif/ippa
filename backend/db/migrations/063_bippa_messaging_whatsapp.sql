-- Revisão do WhatsApp para o novo desenho centralizado: o Catálogo deixa de
-- falar direto com a Graph API da Meta (seller_whatsapp_integrations, token
-- Meta cifrado, waba_id/phone_number_id por vendedora) e passa a delegar
-- tudo -- Embedded Signup, envio de mensagem, token da Meta -- ao serviço
-- central bippa-messaging (https://bippa-messaging.onrender.com). O vínculo
-- continua por VENDEDORA (não por tenant), mas sem nenhuma credencial da
-- Meta no banco do Catálogo (nada de token/App Secret/WABA ID, nada de
-- chamada direta à Graph API) -- só o estado local de referência da conexão
-- de cada vendedora com o bippa-messaging.
--
-- Ver backend/src/messaging/{bippaAuthClient,bippaMessagingClient}.ts para
-- os clients novos e backend/src/services/whatsapp/*.ts para os serviços
-- reescritos sobre eles.

-- seller_whatsapp_integrations guardava waba_id/phone_number_id/token Meta
-- cifrado por vendedora (migration 056) -- não existe mais no novo desenho,
-- o bippa-messaging é quem guarda credencial da Meta.
DROP TABLE IF EXISTS seller_whatsapp_integrations;

-- whatsapp_webhook_events guardava callbacks de status (sent/delivered/
-- read/failed) que a Meta entregava direto pro Catálogo (migration 057) --
-- agora é o bippa-messaging quem recebe webhook da Meta, não o Catálogo.
DROP TABLE IF EXISTS whatsapp_webhook_events;

-- audit_action.whatsapp_integration.* e audit_entity_type.whatsapp_integration
-- (migration 056) continuam válidos semanticamente no novo modelo
-- tenant-level (connected/activated/deactivated/disconnected ainda fazem
-- sentido para a conexão de um tenant) -- mantidos como estão. Postgres não
-- suporta remover valor de enum (`ALTER TYPE ... DROP VALUE` não existe),
-- então não há nada a fazer aqui além de não recriá-los.

-- Estado local de referência da conexão de cada vendedora com o
-- bippa-messaging -- NUNCA credencial da Meta (token, WABA ID, App Secret):
-- tudo isso fica só
-- no bippa-messaging. Uma linha por VENDEDORA (não por tenant): cada tenant
-- pode ter N vendedoras, cada uma com seu próprio número WhatsApp Business
-- conectado -- é o admin quem conecta em nome dela (ver
-- whatsappOnboardingService.ts / whatsappIntegrationService.ts). tenant_id
-- fica para isolamento via RLS e para listar todas as conexões de um tenant.
CREATE TABLE whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Vendedora dona desta conexão -- 1 vendedora tem no máximo 1 número
  -- conectado (UNIQUE abaixo). ON DELETE CASCADE: excluir a vendedora
  -- remove a conexão local (o bippa-messaging mantém seu próprio registro).
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Identificador do telefone no bippa-messaging -- nulo até a
  -- administradora escolher um telefone e associá-lo (ver
  -- associateWhatsAppSenderProfile em whatsappIntegrationService.ts).
  phone_id text,
  -- "<tenant_id>:<seller_id>" -- é o identificador que o bippa-messaging usa
  -- para reconhecer "qual conexão é esta" nas chamadas de admin e de envio
  -- (source_reference). Antes era só tenant_id; passou a incluir seller_id
  -- porque agora um tenant pode ter várias conexões (uma por vendedora).
  external_reference text NOT NULL,
  -- Chave do sender profile desta vendedora no bippa-messaging, formato
  -- "catalogo:<tenant_id>:<seller_id>" -- ver whatsappIntegrationService.ts.
  sender_profile_key text NOT NULL,
  capability_payments boolean NOT NULL DEFAULT false,
  display_phone_masked text,
  verified_name text,
  quality_rating text,
  status text NOT NULL DEFAULT 'not_connected',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id)
);

CREATE INDEX whatsapp_connections_tenant_id_idx ON whatsapp_connections (tenant_id);

ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON whatsapp_connections FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_connections TO ippa_app;
