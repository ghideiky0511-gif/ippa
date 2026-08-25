-- Base para upsell + separação física (Bippa): o pedido (orders) deixa de
-- ser só o registro criado no instante do pagamento e passa a poder ter
-- status e itens normalizados desde antes de pagar, atendido em mais de
-- uma sessão. Esta migration é só schema (aditiva, nada é removido ou
-- renomeado) -- o código atual continua funcionando sem alteração:
-- insertOrderRow não referencia `status` (cai no default 'pago', que é
-- exatamente o que toda linha de orders sempre foi até hoje) e
-- insertOrderItemRow não referencia nenhuma coluna nova de order_items.
-- Migrar orderService/orderSessionService/paymentService para de fato
-- criar o pedido antes do pagamento, preencher order_sessions.order_id e
-- aposentar order_session_items fica para uma migration/PR seguinte.

-- orders: status deixa de ser implícito (linha existe = pago) e vira
-- explícito, já que agora o pedido pode existir antes de pago.
ALTER TABLE orders
  ADD COLUMN status text NOT NULL DEFAULT 'pago',
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
    CHECK (status = ANY (ARRAY['aberto', 'aguardando_pagamento', 'pago', 'cancelado']));

-- order_sessions: um mesmo pedido pode ser atendido em mais de uma sessão
-- (upsell). Nullable porque, até a virada dos services, sessão e pedido
-- continuam desacoplados como são hoje (order_id só passa a ser
-- preenchido quando o service layer for migrado).
ALTER TABLE order_sessions
  ADD COLUMN order_id uuid REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX order_sessions_order_idx ON order_sessions (tenant_id, order_id) WHERE order_id IS NOT NULL;

-- order_items: quantidade e preço saem do jsonb `snapshot` e viram colunas
-- reais -- dá pra somar/filtrar via SQL, o que hoje não existe. variant_id
-- casa a linha com o estoque (product_variants/inventory_balances, hoje só
-- ligados por product_id, sem grade). qty_separated é o quanto já foi
-- confirmado como fisicamente separado. Backfill roda antes das
-- constraints NOT NULL para cobrir pedidos já existentes.
ALTER TABLE order_items
  ADD COLUMN variant_id uuid,
  ADD COLUMN qty integer,
  ADD COLUMN unit_price numeric(12, 2),
  ADD COLUMN qty_separated integer NOT NULL DEFAULT 0;

UPDATE order_items
SET qty = (snapshot->>'qty')::integer
WHERE qty IS NULL;

UPDATE order_items
SET unit_price = (snapshot->>'price')::numeric
WHERE unit_price IS NULL;

UPDATE order_items AS oi
SET variant_id = pv.id
FROM product_variants AS pv
WHERE pv.tenant_id = oi.tenant_id
  AND pv.product_id = oi.product_id
  AND pv.color = (oi.snapshot->>'color')
  AND pv.size = (oi.snapshot->>'size')
  AND oi.variant_id IS NULL
  AND oi.product_id IS NOT NULL;

ALTER TABLE order_items
  ALTER COLUMN qty SET NOT NULL;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_qty_check CHECK (qty > 0),
  ADD CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0),
  ADD CONSTRAINT order_items_qty_separated_check CHECK (qty_separated >= 0),
  ADD CONSTRAINT order_items_tenant_id_order_id_item_key_key UNIQUE (tenant_id, order_id, item_key),
  ADD CONSTRAINT order_items_tenant_id_variant_id_fkey FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants(tenant_id, id) ON DELETE RESTRICT;

-- order_item_events: histórico de quem adicionou/removeu/ajustou item no
-- pedido (upsell) -- cliente ou vendedora. Mesmo idioma de
-- inventory_movements -> inventory_balances já usado neste schema (ledger
-- append-only + saldo atual na tabela principal): aqui o "saldo atual" é
-- order_items.qty, mantido pela aplicação junto com o insert do evento, na
-- mesma transação -- não por trigger (não é como este schema resolve isso
-- em nenhum outro lugar).
CREATE TABLE order_item_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('item_added', 'item_removed', 'qty_adjusted')),
  qty_delta integer NOT NULL CHECK (qty_delta <> 0),
  actor_id uuid NOT NULL,
  actor_role user_role NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX order_item_events_order_idx ON order_item_events (tenant_id, order_id, occurred_at DESC);

ALTER TABLE order_item_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON order_item_events FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON order_item_events TO ippa_app;

-- order_item_fulfillment_events: confirmação de separação física vinda do
-- Bippa em tempo real. Separado de order_item_events de propósito -- são
-- atores diferentes (cliente/vendedora mexendo no pedido vs. Bippa
-- confirmando o que foi separado na prateleira), e o pedido pode mudar de
-- quantidade enquanto o Bippa já começou a separar; ter as duas fitas
-- independentes é o que permite reconciliar isso depois. A integração em
-- si (credenciais, mapeamento pedido<->id-no-Bippa, log de request e
-- response, status operacional) reaproveita tenant_erp_integrations /
-- erp_external_references / external_api_request_log já existentes -- só
-- uma linha nova com provider = 'bippa', sem tabela nova para isso.
CREATE TABLE order_item_fulfillment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  qty_delta integer NOT NULL CHECK (qty_delta <> 0),
  external_reference text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX order_item_fulfillment_events_order_idx ON order_item_fulfillment_events (tenant_id, order_id, occurred_at DESC);

ALTER TABLE order_item_fulfillment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_fulfillment_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON order_item_fulfillment_events FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON order_item_fulfillment_events TO ippa_app;
