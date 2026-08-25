-- Um talão é o agrupador operacional de vários pedidos ainda em montagem.
-- `order_sessions` continua representando o pedido atual de uma cliente;
-- o talão passa a ser uma entidade própria, permitindo vários em paralelo.
CREATE TABLE order_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_books FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON order_books FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON order_books TO ippa_app;

ALTER TABLE order_sessions ADD COLUMN order_book_id uuid REFERENCES order_books(id) ON DELETE RESTRICT;

-- Preserva os atendimentos existentes: cada vendedora recebe um talão legado
-- e todas as suas sessões anteriores ficam associadas a ele.
INSERT INTO order_books (tenant_id, seller_id, name, is_active, created_at, updated_at)
SELECT tenant_id, seller_id, 'Talão legado', true, min(created_at), max(updated_at)
FROM order_sessions
GROUP BY tenant_id, seller_id;

UPDATE order_sessions AS session
SET order_book_id = book.id
FROM order_books AS book
WHERE book.tenant_id = session.tenant_id
  AND book.seller_id = session.seller_id
  AND book.name = 'Talão legado';

ALTER TABLE order_sessions ALTER COLUMN order_book_id SET NOT NULL;

CREATE INDEX order_books_tenant_seller_updated_idx
  ON order_books (tenant_id, seller_id, updated_at DESC);
CREATE UNIQUE INDEX order_books_one_active_per_seller_idx
  ON order_books (tenant_id, seller_id)
  WHERE is_active AND status = 'aberto';
CREATE INDEX order_sessions_tenant_book_status_idx
  ON order_sessions (tenant_id, order_book_id, status, updated_at DESC);
