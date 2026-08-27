-- Motor de pagamento real (Pix, boleto, cartão), gateway próprio do tenant --
-- ver docs de contexto na conversa que originou esta migration. Ao contrário
-- de tenant_erp_integrations (migration 011/018), aqui a credencial
-- movimenta dinheiro de verdade: `credentials_encrypted` guarda os segredos
-- cifrados (AES-256-GCM na aplicação, ver lib/crypto/paymentCredentials.ts;
-- a chave fica só em PAYMENT_CREDENTIALS_ENCRYPTION_KEY, nunca no banco/SQL).
-- `credentials_meta` guarda só os campos NÃO secretos (ex.: accountId
-- público), para a UI exibir sem precisar decifrar nada.
--
-- Esta migration só cria schema -- nenhum provider real (iugu) ainda; a
-- primeira fase usa somente o provider "mock" (fixture, hidden no catálogo,
-- mesmo padrão de erp/providers/mock).

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'payment_integration.configured';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'payment_integration.activated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'payment_integration.deactivated';
ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'payment_integration';

CREATE TABLE tenant_payment_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  -- IV + tag + ciphertext concatenados por paymentCredentials.ts -- opaco
  -- para o banco de propósito, nunca lido/gravado como jsonb aqui.
  credentials_encrypted bytea NOT NULL,
  credentials_meta jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(credentials_meta) = 'object'),
  active boolean NOT NULL DEFAULT false,
  -- Segredo usado para validar a assinatura de webhooks deste tenant/provider
  -- (ex.: account token da iugu) -- nasce em claro (não é uma credencial de
  -- API que autoriza cobrança), mas ainda assim nunca exposto pelo service.
  webhook_secret text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider),
  -- Alvo de FK composta vinda de payment_charges abaixo -- mesmo padrão de
  -- tenant_erp_integrations (migration 011).
  UNIQUE (tenant_id, id)
);

-- Um provider ativo por vez por tenant (mesmo raciocínio de
-- tenant_erp_integrations: o motor troca, não acumula).
CREATE UNIQUE INDEX tenant_payment_integrations_one_active_idx
  ON tenant_payment_integrations (tenant_id) WHERE active;

CREATE TYPE payment_charge_method AS ENUM ('pix', 'boleto', 'cartao');

-- pending: criado no provider, aguardando ação/confirmação (Pix/boleto).
-- processing: cartão em autorização.
-- authorized: confirmado (equivalente a fatura paga do lado do provider),
--   mas não necessariamente liquidado -- já libera separação física.
-- paid: liquidado (ex.: invoice.released da iugu) -- momento financeiro.
-- failed/expired/cancelled: terminais sem sucesso.
CREATE TYPE payment_charge_status AS ENUM (
  'pending', 'processing', 'authorized', 'paid', 'failed', 'expired', 'cancelled'
);

-- Uma linha por tentativa de cobrança -- pode existir mais de uma por
-- pedido/sessão (ex.: Pix expirou, cliente tenta de novo com boleto).
-- order_session_id fica solto (SET NULL) porque a sessão pode fechar/ser
-- reaproveitada independente do histórico de cobrança já criado.
CREATE TABLE payment_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  provider text NOT NULL,
  -- Bare FK, mesmo padrão de provider_orders.order_id (migration 029):
  -- orders é entidade de domínio grande, não tabela de config.
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_session_id uuid REFERENCES order_sessions(id) ON DELETE SET NULL,
  method payment_charge_method NOT NULL,
  status payment_charge_status NOT NULL DEFAULT 'pending',
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  external_id text,
  external_status text,
  pix_qr_code text,
  pix_copy_paste text,
  boleto_barcode text,
  boleto_pdf_url text,
  card_last_digits text,
  card_brand text,
  -- Prazo da COBRANÇA em si no provider (Pix expira em minutos, boleto em
  -- dias) -- distinto de order_sessions.payment_token_created_at +
  -- payment_link_expiration_minutes, que é o prazo do LINK, não da cobrança.
  provider_expires_at timestamptz,
  -- Reconciliação ativa (ver paymentChargeService.getChargeStatus): quando
  -- vencido, a próxima consulta de status reconsulta o provider antes de
  -- responder, cobrindo webhook perdido enquanto alguém olha a página.
  last_checked_at timestamptz,
  next_check_at timestamptz,
  paid_at timestamptz,
  raw_create_response jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_create_response) = 'object'),
  raw_last_webhook jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_last_webhook) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, integration_id) REFERENCES tenant_payment_integrations(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id)
);

CREATE INDEX payment_charges_order_idx
  ON payment_charges (tenant_id, order_id, created_at DESC);

-- Idempotência de criação/consulta: nunca duas linhas para a mesma cobrança
-- do lado do provider. Parcial porque external_id só existe depois que o
-- provider responde à criação (pode ficar NULL por um instante).
CREATE UNIQUE INDEX payment_charges_external_idx
  ON payment_charges (tenant_id, provider, external_id) WHERE external_id IS NOT NULL;

-- Fila de reconciliação ativa: só cobranças ainda em aberto precisam ser
-- reconsultadas.
CREATE INDEX payment_charges_reconcile_idx
  ON payment_charges (tenant_id, status, next_check_at)
  WHERE status IN ('pending', 'processing');

-- Log append-only de todo webhook recebido, cru -- mesmo espírito de
-- provider_order_attempts (migration 035): payment_charges guarda só o
-- estado ATUAL, esta tabela reconstrói "o que aconteceu" e garante
-- idempotência (não reprocessar o mesmo evento do provider duas vezes).
-- tenant_id fica nullable: a rota de webhook (sem tenant na URL, ver plano)
-- pode receber um payload cujo tenant só é identificável depois de olhar o
-- conteúdo -- um evento não identificável ainda é logado, com
-- signature_valid=false e processing_error preenchido.
CREATE TABLE payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_event_id text,
  charge_id uuid REFERENCES payment_charges(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  signature_valid boolean NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_webhook_events_charge_idx
  ON payment_webhook_events (tenant_id, charge_id, created_at DESC);

-- orders ganha o dado financeiro separado do status operacional (aberto|
-- aguardando_pagamento|novo|separado|pago|cancelado, inalterado): um webhook
-- que confirma a cobrança (ex. invoice.status_changed->paid da iugu) avança
-- `status` pra 'novo' (libera separação, como o link manual já faz hoje) e
-- marca payment_status='awaiting_confirmation'; só quando o provider avisa
-- que o valor foi liquidado (ex. invoice.released) é que payment_status vira
-- 'paid' e paid_at é preenchido -- sem mexer em `status`, que segue seu
-- próprio ciclo de separação física.
ALTER TABLE orders
  ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'awaiting_confirmation', 'paid', 'payment_failed')),
  ADD COLUMN paid_at timestamptz;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_payment_integrations', 'payment_charges', 'payment_webhook_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_payment_integrations, payment_charges TO ippa_app;
-- Append-only, igual provider_order_attempts (migration 035): sem UPDATE nem
-- DELETE para a aplicação -- só processed_at/processing_error, escritos por
-- um novo INSERT nunca por edição da linha original.
GRANT SELECT, INSERT ON payment_webhook_events TO ippa_app;
