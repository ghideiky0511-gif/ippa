-- ETL persistente de catálogo ERP: publicação separada de estoque,
-- reconciliação referência -> SKU e fila/checkpoint por integração.

ALTER TABLE products
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN source_origin text NOT NULL DEFAULT 'manual'
    CHECK (source_origin IN ('manual', 'bootstrap', 'erp'));

ALTER TABLE product_variants
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN source_origin text NOT NULL DEFAULT 'manual'
    CHECK (source_origin IN ('manual', 'bootstrap', 'erp'));

CREATE INDEX products_tenant_active_idx
  ON products (tenant_id, updated_at DESC) WHERE is_active;
CREATE INDEX product_variants_tenant_product_active_idx
  ON product_variants (tenant_id, product_id) WHERE is_active;

ALTER TABLE erp_external_references
  DROP CONSTRAINT erp_external_references_entity_type_check;
ALTER TABLE erp_external_references
  ADD CONSTRAINT erp_external_references_entity_type_check
  CHECK (entity_type IN ('product', 'product_variant', 'order', 'client', 'company'));

CREATE TABLE catalog_sync_configs (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  classification_type_code integer,
  classification_codes text[] NOT NULL DEFAULT '{}'::text[],
  poll_interval_seconds integer NOT NULL DEFAULT 300
    CHECK (poll_interval_seconds BETWEEN 60 AND 86400),
  overlap_seconds integer NOT NULL DEFAULT 120
    CHECK (overlap_seconds BETWEEN 0 AND 3600),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, integration_id),
  FOREIGN KEY (tenant_id, integration_id)
    REFERENCES tenant_erp_integrations(tenant_id, id) ON DELETE CASCADE,
  CHECK (
    NOT enabled OR (
      classification_type_code IS NOT NULL
      AND cardinality(classification_codes) > 0
    )
  )
);

CREATE TABLE catalog_sync_states (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  checkpoint_at timestamptz,
  next_incremental_at timestamptz NOT NULL DEFAULT now(),
  last_full_sync_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, integration_id),
  FOREIGN KEY (tenant_id, integration_id)
    REFERENCES tenant_erp_integrations(tenant_id, id) ON DELETE CASCADE
);

-- Integrações que já tiverem os novos campos nas credenciais entram no
-- motor sem exigir um novo salvamento no workspace.
INSERT INTO catalog_sync_configs (
  tenant_id, integration_id, enabled, classification_type_code, classification_codes
)
SELECT integration.tenant_id,
       integration.id,
       true,
       (integration.credentials->>'classificationTypeCode')::integer,
       regexp_split_to_array(integration.credentials->>'classificationCodes', '\s*,\s*')
FROM tenant_erp_integrations integration
WHERE integration.provider = 'totvsmoda'
  AND integration.credentials->>'classificationTypeCode' ~ '^[0-9]+$'
  AND btrim(integration.credentials->>'classificationCodes') <> ''
ON CONFLICT (tenant_id, integration_id) DO NOTHING;

CREATE TABLE catalog_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('incremental', 'full')),
  status text NOT NULL DEFAULT 'discovering'
    CHECK (status IN ('discovering', 'processing', 'partial', 'succeeded', 'failed')),
  window_start timestamptz,
  window_end timestamptz,
  discovered_count integer NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, integration_id)
    REFERENCES tenant_erp_integrations(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id)
);

CREATE INDEX catalog_sync_runs_integration_started_idx
  ON catalog_sync_runs (tenant_id, integration_id, started_at DESC);

CREATE TABLE catalog_sync_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  run_id uuid NOT NULL,
  reference_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 6),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, integration_id)
    REFERENCES tenant_erp_integrations(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES catalog_sync_runs(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, run_id, reference_code)
);

CREATE INDEX catalog_sync_items_due_idx
  ON catalog_sync_items (tenant_id, integration_id, next_attempt_at, created_at)
  WHERE status = 'pending';

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'catalog_sync_configs', 'catalog_sync_states',
    'catalog_sync_runs', 'catalog_sync_items'
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

GRANT SELECT, INSERT, UPDATE, DELETE ON
  catalog_sync_configs, catalog_sync_states, catalog_sync_runs, catalog_sync_items
TO ippa_app;

GRANT SELECT ON catalog_sync_configs, catalog_sync_states TO ippa_control;
