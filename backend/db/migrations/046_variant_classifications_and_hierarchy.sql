-- Classificacoes passam a pertencer exclusivamente a variantes. A estrutura
-- legada por produto e descartada deliberadamente, sem backfill.

DROP TABLE IF EXISTS product_classifications;
DROP TABLE IF EXISTS classifications;
DROP TABLE IF EXISTS classification_types;

ALTER TABLE products
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS subcategory,
  DROP COLUMN IF EXISTS collection,
  DROP COLUMN IF EXISTS brand;

DROP TYPE IF EXISTS classification_kind;

CREATE TABLE classification_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  external_code text NOT NULL CHECK (btrim(external_code) <> ''),
  label text NOT NULL CHECK (btrim(label) <> ''),
  auxiliary_label text,
  category_level smallint CHECK (category_level BETWEEN 1 AND 3),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, integration_id)
    REFERENCES tenant_erp_integrations(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, integration_id, external_code)
);
CREATE UNIQUE INDEX classification_types_category_level_idx
  ON classification_types (tenant_id, integration_id, category_level)
  WHERE category_level IS NOT NULL;

CREATE TABLE classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  classification_type_id uuid NOT NULL,
  parent_id uuid,
  external_code text NOT NULL CHECK (btrim(external_code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  auxiliary_name text,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, classification_type_id)
    REFERENCES classification_types(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, parent_id)
    REFERENCES classifications(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, id, classification_type_id),
  UNIQUE NULLS NOT DISTINCT
    (tenant_id, classification_type_id, parent_id, external_code)
);
CREATE INDEX classifications_tenant_type_parent_position_idx
  ON classifications (tenant_id, classification_type_id, parent_id, position, name);

CREATE TABLE variant_classifications (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL,
  classification_id uuid NOT NULL,
  classification_type_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, variant_id, classification_id),
  FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variants(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, classification_id, classification_type_id)
    REFERENCES classifications(tenant_id, id, classification_type_id) ON DELETE CASCADE
);
CREATE INDEX variant_classifications_variant_type_idx
  ON variant_classifications (tenant_id, variant_id, classification_type_id);
CREATE INDEX variant_classifications_classification_idx
  ON variant_classifications (tenant_id, classification_id, variant_id);

ALTER TABLE classification_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_types FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON classification_types
  FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE classifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON classifications
  FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE variant_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_classifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON variant_classifications
  FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON
  classification_types, classifications, variant_classifications
TO ippa_app;

-- A integracao pode continuar configurada, mas o catalogo fica pausado ate
-- que um nivel 1 seja escolhido na pagina dedicada da TOTVS. O checkpoint e
-- invalidado para garantir um full sync depois da configuracao.
UPDATE catalog_sync_configs SET enabled = false, updated_at = now();
UPDATE catalog_sync_states
SET checkpoint_at = NULL, last_full_sync_at = NULL,
    next_incremental_at = now(), updated_at = now();

-- Configuracoes antigas usavam nomes de categoria como chaves. Sem backfill
-- das classificacoes, elas nao podem ser traduzidas com seguranca para UUIDs.
UPDATE store_settings
SET similar_products_settings = jsonb_set(
      COALESCE(similar_products_settings, '{}'::jsonb),
      '{complementaryCategories}', '{}'::jsonb, true
    ),
    updated_at = now();
