-- Número legível do pedido: único e sequencial dentro de cada tenant.
-- O UUID de orders.id continua sendo a chave técnica e não é exposto como
-- identificação comercial do pedido.
ALTER TABLE orders ADD COLUMN order_number integer;

WITH numbered_orders AS (
  SELECT id,
         row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id)::integer AS order_number
  FROM orders
)
UPDATE orders
SET order_number = numbered_orders.order_number
FROM numbered_orders
WHERE orders.id = numbered_orders.id;

ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;

CREATE UNIQUE INDEX orders_tenant_order_number_key
  ON orders (tenant_id, order_number);

-- O contador é atualizado na mesma transação do INSERT do pedido. O UPSERT
-- serializa alocações concorrentes sem criar lacunas quando a transação falha.
CREATE TABLE tenant_order_counters (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  next_order_number integer NOT NULL CHECK (next_order_number > 0)
);

INSERT INTO tenant_order_counters (tenant_id, next_order_number)
SELECT tenants.id, COALESCE(MAX(orders.order_number), 0) + 1
FROM tenants
LEFT JOIN orders ON orders.tenant_id = tenants.id
GROUP BY tenants.id;

ALTER TABLE tenant_order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_order_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_order_counters
  FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
