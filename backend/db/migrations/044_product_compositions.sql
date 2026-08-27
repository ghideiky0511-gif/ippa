-- Composição (material/percentual de fibra) de um produto, vinda do ERP.
-- Tabelas relacionais dedicadas (não JSONB) por pedido explícito: precisa de
-- tipagem e conformidade de dados entre tenants e diferentes ERP providers.
-- "provider" torna isso multiprovider: cada ERP grava sua própria composição
-- sem colidir, e um produto pode ter composições de mais de um provider ao
-- longo do tempo se o tenant trocar de ERP.

CREATE TABLE product_compositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  provider text NOT NULL,
  external_code text NOT NULL,
  description text NOT NULL,
  type_description text,
  external_group_code text,
  group_description text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id, provider, external_code)
);

CREATE TABLE product_composition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  composition_id uuid NOT NULL,
  external_code text,
  material text NOT NULL,
  percentage numeric(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, composition_id) REFERENCES product_compositions(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX product_compositions_tenant_product_idx ON product_compositions (tenant_id, product_id);
CREATE INDEX product_composition_items_tenant_composition_idx ON product_composition_items (tenant_id, composition_id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['product_compositions', 'product_composition_items']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON product_compositions, product_composition_items TO ippa_app;
