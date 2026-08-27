-- Extrai orders.shipping / order_sessions.shipping (jsonb solto, hoje só
-- preenchido pelo mock de frete em frontend/src/lib/shipping.ts -- ver
-- contracts/shared.ts ShippingOptionSchema) para tabelas próprias, abrindo
-- espaço para o que ainda não existe: cotação com múltiplas opções por
-- provider (freight_quotes), rastreio com histórico de status
-- (order_freight_tracking_events) e configuração de transportadora por
-- tenant (freight_providers) -- sem repetir o desenho de
-- tenant_erp_integrations (migration 011) porque aqui MAIS de um provider
-- fica ativo ao mesmo tempo (retirada + entrega padrão + expressa
-- coexistem hoje; um ERP não).
--
-- Escopo desta migration: só o schema + backfill. orders.shipping e
-- order_sessions.shipping continuam existindo -- o código TypeScript
-- (ordersModel.ts, orderMapper.ts, orderSessionService.ts, paymentService.ts,
-- paymentLinkService.ts, orderService.ts, erpSyncService.ts,
-- totvsmoda/mapper.ts) ainda lê/escreve as colunas antigas sem quebrar.
-- A remoção das duas colunas fica para uma migration de follow-up, quando
-- esse código for cortado para usar as tabelas/colunas novas no lugar.

CREATE TYPE freight_provider_kind AS ENUM ('pickup', 'fixed', 'carrier');

-- Espelha o vocabulário de rastreio de transportadora sem tentar cobrir
-- todo status de toda operadora -- granularidade suficiente pro talão/
-- "Meus pedidos" mostrarem onde a encomenda está.
CREATE TYPE order_freight_status AS ENUM (
  'aguardando', 'etiqueta_emitida', 'em_transporte', 'entregue', 'devolvido', 'cancelado'
);

-- Config de frete por tenant -- substitui MOCK_SHIPPING_OPTIONS
-- (frontend/src/lib/shipping.ts). Ao contrário de tenant_erp_integrations
-- (um provider ativo por vez), aqui VÁRIOS ficam ativos ao mesmo tempo: a
-- loja oferece retirada + tabela fixa + (no futuro) uma transportadora de
-- verdade simultaneamente, então não há índice de "um ativo" aqui.
CREATE TABLE freight_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  name text NOT NULL,
  kind freight_provider_kind NOT NULL,
  active boolean NOT NULL DEFAULT true,
  -- Parâmetros específicos do kind (ex.: preço/prazo fixo pra 'fixed',
  -- instruções de retirada pra 'pickup', base_url/CEP de origem pra
  -- 'carrier') -- livre de propósito, cada kind lê as chaves que precisa,
  -- sem exigir migration pra campo novo (mesmo raciocínio de
  -- tenant_erp_integrations.credentials, migration 011).
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(credentials) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  -- Alvo de FK composta (tenant_id, id) vindo de freight_quotes/
  -- order_freights/order_sessions abaixo -- sem isso nada impede uma linha
  -- referenciar o provider de OUTRO tenant enquanto seu próprio tenant_id
  -- aponta pra si mesma (mesmo padrão de tenant_erp_integrations).
  UNIQUE (tenant_id, id)
);

CREATE INDEX freight_providers_tenant_active_idx
  ON freight_providers (tenant_id) WHERE active;

-- Cotação: uma linha por opção mostrada pra vendedora/cliente ao montar o
-- frete de uma sessão (hoje sempre as 3 opções mockadas; quando existir
-- integração de verdade, N linhas por chamada ao provider). `selected`
-- marca qual delas foi escolhida -- order_sessions.freight_quote_id abaixo
-- aponta pra essa linha, e order_freights guarda o mesmo id como trilha de
-- auditoria de "qual cotação virou pedido".
CREATE TABLE freight_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Bare FK (não composta), mesmo padrão de provider_orders.order_id
  -- (migration 029): order_sessions é entidade de domínio grande, não
  -- tabela de config -- a consistência de tenant já vem da RLS mais o
  -- app_tenant_id() de quem grava.
  order_session_id uuid NOT NULL REFERENCES order_sessions(id) ON DELETE CASCADE,
  provider_id uuid,
  kind freight_provider_kind NOT NULL,
  label text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  eta_label text,
  -- Só o CEP de destino, não o endereço inteiro (esse já vive em
  -- clients.cep/street/... -- ver migration 011 companies pro padrão de
  -- colunas soltas em vez de jsonb pra endereço). CEP é o único dado que
  -- uma cotação de verdade precisa pra justificar o preço calculado;
  -- guardar mais que isso aqui duplicaria o cadastro do cliente à toa.
  destination_cep text,
  -- Id da cotação do lado do provider (rastreamento/depuração) e a resposta
  -- crua, no mesmo espírito de provider_orders.response (migration 029) --
  -- não modelamos nenhum campo específico de provider aqui de propósito.
  external_quote_id text,
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_response) = 'object'),
  selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, provider_id) REFERENCES freight_providers(tenant_id, id) ON DELETE SET NULL,
  UNIQUE (tenant_id, id)
);

CREATE INDEX freight_quotes_session_idx
  ON freight_quotes (tenant_id, order_session_id, created_at DESC);

-- No máximo uma cotação escolhida por sessão -- trocar de opção marca a
-- antiga selected=false antes de marcar a nova (aplicação), nunca as duas
-- ao mesmo tempo.
CREATE UNIQUE INDEX freight_quotes_one_selected_per_session_idx
  ON freight_quotes (tenant_id, order_session_id) WHERE selected;

-- order_sessions ganha o "frete escolhido" como colunas próprias (link pra
-- cotação + snapshot), no lugar do jsonb solto. Snapshot aqui (não só a FK)
-- pelo mesmo motivo de order_freights abaixo: todo cálculo de total
-- (orderSessionService/paymentService) precisa do preço em toda leitura
-- quente da sessão, sem depender de JOIN em freight_quotes a cada chamada,
-- e sem quebrar se a cotação de origem for reprocessada depois.
ALTER TABLE order_sessions
  ADD COLUMN freight_quote_id uuid,
  ADD COLUMN freight_provider_id uuid,
  ADD COLUMN freight_kind freight_provider_kind,
  ADD COLUMN freight_label text,
  ADD COLUMN freight_price numeric(12,2) CHECK (freight_price IS NULL OR freight_price >= 0),
  ADD COLUMN freight_eta_label text;

ALTER TABLE order_sessions
  ADD CONSTRAINT order_sessions_freight_quote_fkey
    FOREIGN KEY (tenant_id, freight_quote_id) REFERENCES freight_quotes(tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT order_sessions_freight_provider_fkey
    FOREIGN KEY (tenant_id, freight_provider_id) REFERENCES freight_providers(tenant_id, id) ON DELETE SET NULL;

-- Substitui orders.shipping: 1 linha por pedido (nem todo pedido tem uma --
-- ShippingOptionSchema é opcional em Order/CreateCustomerOrderInput hoje, e
-- continua sendo: pedido sem frete simplesmente não ganha linha aqui).
-- quote_id é só trilha de auditoria (qual cotação originou este frete, pode
-- ficar NULL pra pedido antigo/legado sem cotação de verdade por trás);
-- provider_id idem. kind/label/price/eta_label são sempre o snapshot no
-- momento em que o pedido fechou -- igual ao resto do sistema (ver discount
-- jsonb em orders, mesmo raciocínio de "preço não muda debaixo do pedido já
-- fechado").
CREATE TABLE order_freights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Bare FK, mesmo padrão de provider_orders.order_id (migration 029).
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_id uuid,
  quote_id uuid,
  kind freight_provider_kind NOT NULL,
  label text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  eta_label text,
  destination_cep text,
  -- Rastreio: preenchido quando existir integração de verdade com
  -- transportadora. tracking_code/tracking_url ficam soltos (não um jsonb)
  -- porque são os dois únicos campos que qualquer tela (talão, "Meus
  -- pedidos") precisa mostrar direto; o resto do histórico normalizado vive
  -- em order_freight_tracking_events abaixo.
  tracking_code text,
  tracking_url text,
  status order_freight_status NOT NULL DEFAULT 'aguardando',
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, provider_id) REFERENCES freight_providers(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, quote_id) REFERENCES freight_quotes(tenant_id, id) ON DELETE SET NULL,
  -- 1:1 com o pedido -- nunca duas linhas de frete pro mesmo order_id
  -- (trocar de opção atualiza esta linha, não insere outra).
  UNIQUE (tenant_id, order_id),
  -- Alvo de FK composta vindo de order_freight_tracking_events abaixo.
  UNIQUE (tenant_id, id)
);

-- Consulta operacional: "o que ainda não chegou", mesmo espírito de
-- orders_tenant_paid_created_idx (migrations 002/006).
CREATE INDEX order_freights_tenant_pending_idx
  ON order_freights (tenant_id, status, updated_at DESC)
  WHERE status NOT IN ('entregue', 'cancelado');

-- Histórico de rastreio, append-only -- mesmo padrão de
-- provider_order_attempts (migration 035): order_freights.status guarda só
-- o estado ATUAL, esta tabela é quem permite reconstruir "o que aconteceu"
-- (cada atualização de rastreio de um provider vira uma linha nova, nunca
-- sobrescreve a anterior).
CREATE TABLE order_freight_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_freight_id uuid NOT NULL,
  status order_freight_status NOT NULL,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, order_freight_id) REFERENCES order_freights(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX order_freight_tracking_events_freight_idx
  ON order_freight_tracking_events (tenant_id, order_freight_id, occurred_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'freight_providers', 'freight_quotes', 'order_freights', 'order_freight_tracking_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON freight_providers, freight_quotes, order_freights TO ippa_app;
-- Append-only, igual provider_order_attempts (migration 035).
GRANT SELECT, INSERT ON order_freight_tracking_events TO ippa_app;

-- === Seed: transforma o mock hardcoded (frontend/src/lib/shipping.ts) em
-- linhas reais de freight_providers por tenant, ANTES do backfill abaixo --
-- é o que permite casar orders.shipping->>'id' / order_sessions.shipping->
-- >'id' ("retirada"/"padrao"/"expressa", ids de texto livre --
-- ShippingOptionSchema.id é EntityIdSchema, string livre, não uuid) com uma
-- linha de provider de verdade.
INSERT INTO freight_providers (tenant_id, code, name, kind, configuration)
SELECT t.id, v.code, v.name, v.kind::freight_provider_kind, v.configuration::jsonb
FROM tenants t
CROSS JOIN (VALUES
  ('retirada', 'Retirada no showroom', 'pickup', '{}'),
  ('padrao', 'Entrega padrão', 'fixed', '{"price": 19.90, "etaLabel": "5 a 8 dias úteis"}'),
  ('expressa', 'Entrega expressa', 'fixed', '{"price": 39.90, "etaLabel": "2 a 3 dias úteis"}')
) AS v(code, name, kind, configuration)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- === Backfill order_sessions.shipping -> as 6 colunas novas.
-- Passo 1: casa pelo código do provider seedado acima.
UPDATE order_sessions s
SET freight_provider_id = fp.id,
    freight_kind = fp.kind,
    freight_label = COALESCE(NULLIF(s.shipping->>'label', ''), fp.name),
    freight_price = COALESCE((s.shipping->>'price')::numeric, 0),
    freight_eta_label = NULLIF(s.shipping->>'prazo', '')
FROM freight_providers fp
WHERE s.shipping IS NOT NULL
  AND fp.tenant_id = s.tenant_id
  AND fp.code = s.shipping->>'id';

-- Passo 2: sobra (id que não bate com nenhum dos 3 conhecidos -- não
-- deveria existir hoje, já que o mock só gera esses 3, mas o backfill não
-- pode perder o snapshot por causa de um dado inesperado). Preserva preço/
-- label/prazo sem link de provider.
UPDATE order_sessions s
SET freight_kind = 'fixed',
    freight_label = COALESCE(NULLIF(s.shipping->>'label', ''), 'Frete'),
    freight_price = COALESCE((s.shipping->>'price')::numeric, 0),
    freight_eta_label = NULLIF(s.shipping->>'prazo', '')
WHERE s.shipping IS NOT NULL AND s.freight_price IS NULL;

-- === Backfill orders.shipping -> order_freights (mesmos dois passos).
INSERT INTO order_freights (tenant_id, order_id, provider_id, kind, label, price, eta_label)
SELECT o.tenant_id, o.id, fp.id, fp.kind,
       COALESCE(NULLIF(o.shipping->>'label', ''), fp.name),
       COALESCE((o.shipping->>'price')::numeric, 0),
       NULLIF(o.shipping->>'prazo', '')
FROM orders o
JOIN freight_providers fp ON fp.tenant_id = o.tenant_id AND fp.code = o.shipping->>'id'
WHERE o.shipping IS NOT NULL;

INSERT INTO order_freights (tenant_id, order_id, kind, label, price, eta_label)
SELECT o.tenant_id, o.id, 'fixed', COALESCE(NULLIF(o.shipping->>'label', ''), 'Frete'),
       COALESCE((o.shipping->>'price')::numeric, 0), NULLIF(o.shipping->>'prazo', '')
FROM orders o
WHERE o.shipping IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_freights ofr WHERE ofr.tenant_id = o.tenant_id AND ofr.order_id = o.id
  );

-- orders.shipping e order_sessions.shipping continuam existindo por ora --
-- o código em ordersModel.ts/orderMapper.ts/orderSessionService.ts/
-- paymentService.ts/paymentLinkService.ts/orderService.ts/erpSyncService.ts/
-- totvsmoda/mapper.ts ainda lê e escreve as colunas antigas. Uma migration
-- de follow-up remove as duas colunas quando esse código for cortado para
-- ler/escrever freight_providers/freight_quotes/order_freights/as novas
-- colunas de order_sessions no lugar.
