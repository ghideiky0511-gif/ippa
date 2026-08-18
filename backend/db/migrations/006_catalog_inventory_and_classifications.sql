-- Catálogo normalizado, disponibilidade por depósito e trilha de estoque.
-- `products.category` e campos correlatos ficam temporariamente como fallback
-- de leitura para os contratos legados; `classifications` é a fonte canônica.

CREATE TYPE variant_availability_mode AS ENUM ('in_stock', 'preorder', 'backorder', 'out_of_stock');
CREATE TYPE order_channel AS ENUM ('presencial', 'whatsapp', 'online');
CREATE TYPE discount_type AS ENUM ('quantity', 'products');
CREATE TYPE home_section_type AS ENUM ('banner', 'product');
CREATE TYPE banner_media_type AS ENUM ('image', 'video');
CREATE TYPE classification_kind AS ENUM ('category', 'subcategory', 'collection', 'brand');
CREATE TYPE inventory_location_kind AS ENUM ('warehouse', 'store', 'virtual');
CREATE TYPE inventory_source_kind AS ENUM ('manual', 'erp', 'marketplace');
CREATE TYPE inventory_movement_type AS ENUM (
  'initial', 'receipt', 'sale', 'return', 'adjustment',
  'transfer_in', 'transfer_out', 'reservation', 'release', 'integration_sync'
);
CREATE TYPE inventory_reservation_status AS ENUM ('active', 'released', 'consumed', 'expired');

-- CHECKs baseados em text precisam sair antes da troca de tipo: depois dela
-- os literais seriam inferidos como text e não teriam operador com o enum.
ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_availability_check;
ALTER TABLE order_sessions DROP CONSTRAINT IF EXISTS order_sessions_channel_check;
ALTER TABLE discounts DROP CONSTRAINT IF EXISTS discounts_type_check;
ALTER TABLE home_sections DROP CONSTRAINT IF EXISTS home_sections_type_check;
ALTER TABLE home_banners DROP CONSTRAINT IF EXISTS home_banners_type_check;

ALTER TABLE product_variants
  ALTER COLUMN availability TYPE variant_availability_mode USING availability::variant_availability_mode,
  ADD COLUMN sku text,
  ADD COLUMN track_inventory boolean NOT NULL DEFAULT false;

ALTER TABLE product_variants ADD CONSTRAINT product_variants_tenant_sku_key UNIQUE NULLS DISTINCT (tenant_id, sku);

ALTER TABLE order_sessions
  ALTER COLUMN channel TYPE order_channel USING channel::order_channel;
ALTER TABLE orders
  ALTER COLUMN channel TYPE order_channel USING channel::order_channel;
ALTER TABLE discounts
  ALTER COLUMN type TYPE discount_type USING type::discount_type;
ALTER TABLE home_sections
  ALTER COLUMN type TYPE home_section_type USING type::home_section_type;
ALTER TABLE home_banners
  ALTER COLUMN type TYPE banner_media_type USING type::banner_media_type;

ALTER TABLE products ALTER COLUMN category DROP NOT NULL;
ALTER TABLE products ADD CONSTRAINT products_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE product_variants ADD CONSTRAINT product_variants_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE classification_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind classification_kind NOT NULL,
  label text NOT NULL,
  hierarchical boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind),
  UNIQUE (tenant_id, id)
);

CREATE TABLE classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  classification_type_id uuid NOT NULL,
  parent_id uuid,
  name text NOT NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,126}$'),
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, classification_type_id) REFERENCES classification_types(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, parent_id) REFERENCES classifications(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE NULLS NOT DISTINCT (tenant_id, classification_type_id, parent_id, slug),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, id, classification_type_id)
);

CREATE TABLE product_classifications (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  classification_id uuid NOT NULL,
  classification_type_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, product_id, classification_id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, classification_id, classification_type_id)
    REFERENCES classifications(tenant_id, id, classification_type_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX product_classifications_primary_idx
  ON product_classifications (tenant_id, product_id, classification_type_id) WHERE is_primary;
CREATE INDEX classifications_tenant_type_parent_position_idx
  ON classifications (tenant_id, classification_type_id, parent_id, position, name);

CREATE TABLE inventory_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind inventory_source_kind NOT NULL,
  code text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);

CREATE TABLE inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id uuid,
  code text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text NOT NULL,
  kind inventory_location_kind NOT NULL DEFAULT 'warehouse',
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, source_id) REFERENCES inventory_sources(tenant_id, id) ON DELETE SET NULL,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX inventory_locations_one_default_per_tenant_idx
  ON inventory_locations (tenant_id) WHERE is_default;

CREATE TABLE inventory_balances (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  on_hand_qty integer NOT NULL DEFAULT 0 CHECK (on_hand_qty >= 0),
  reserved_qty integer NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0 AND reserved_qty <= on_hand_qty),
  available_qty integer GENERATED ALWAYS AS (on_hand_qty - reserved_qty) STORED,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, variant_id, location_id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, location_id) REFERENCES inventory_locations(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE inventory_external_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  external_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, source_id) REFERENCES inventory_sources(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, source_id, external_id),
  UNIQUE (tenant_id, source_id, variant_id)
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  source_id uuid,
  movement_type inventory_movement_type NOT NULL,
  on_hand_delta integer NOT NULL DEFAULT 0,
  reserved_delta integer NOT NULL DEFAULT 0,
  external_reference text,
  idempotency_key uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (on_hand_delta <> 0 OR reserved_delta <> 0),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, location_id) REFERENCES inventory_locations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, source_id) REFERENCES inventory_sources(tenant_id, id) ON DELETE SET NULL,
  UNIQUE NULLS DISTINCT (tenant_id, idempotency_key)
);
CREATE INDEX inventory_movements_tenant_variant_occurred_idx
  ON inventory_movements (tenant_id, variant_id, occurred_at DESC);
CREATE UNIQUE INDEX inventory_movements_external_reference_idx
  ON inventory_movements (tenant_id, source_id, external_reference)
  WHERE source_id IS NOT NULL AND external_reference IS NOT NULL;

CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference_type text NOT NULL CHECK (reference_type IN ('cart', 'order_session', 'order')),
  reference_id uuid NOT NULL,
  status inventory_reservation_status NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE INDEX inventory_reservations_active_expiry_idx
  ON inventory_reservations (tenant_id, expires_at) WHERE status = 'active';

CREATE TABLE inventory_reservation_items (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (tenant_id, reservation_id, variant_id, location_id),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES inventory_reservations(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, location_id) REFERENCES inventory_locations(tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE store_settings ADD COLUMN default_inventory_location_id uuid;
ALTER TABLE store_settings
  ADD CONSTRAINT store_settings_default_inventory_location_fk
  FOREIGN KEY (tenant_id, default_inventory_location_id)
  REFERENCES inventory_locations(tenant_id, id) ON DELETE RESTRICT;

-- Migra saldos legados para o depósito padrão de cada tenant antes de eliminar
-- a coluna que tornava estoque uma propriedade da variante.
INSERT INTO inventory_locations (tenant_id, code, name, kind, is_default)
SELECT id, 'default', 'Depósito padrão', 'warehouse', true FROM tenants
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO inventory_balances (tenant_id, variant_id, location_id, on_hand_qty)
SELECT variant.tenant_id, variant.id, location.id, variant.stock_qty
FROM product_variants variant
JOIN inventory_locations location
  ON location.tenant_id = variant.tenant_id AND location.is_default
WHERE variant.stock_qty IS NOT NULL
ON CONFLICT (tenant_id, variant_id, location_id)
DO UPDATE SET on_hand_qty = EXCLUDED.on_hand_qty, updated_at = now();

UPDATE store_settings settings
SET default_inventory_location_id = location.id
FROM inventory_locations location
WHERE location.tenant_id = settings.tenant_id
  AND location.is_default
  AND settings.default_inventory_location_id IS NULL;

ALTER TABLE product_variants DROP COLUMN stock_qty;

-- As colunas legadas são preenchidas em classificações para leituras de
-- compatibilidade e para a transição gradual dos writers de catálogo.
INSERT INTO classification_types (tenant_id, kind, label, hierarchical)
SELECT tenant.id, kind, label, hierarchical
FROM tenants tenant
CROSS JOIN (VALUES
  ('category'::classification_kind, 'Categorias', true),
  ('subcategory'::classification_kind, 'Subcategorias', true),
  ('collection'::classification_kind, 'Coleções', false),
  ('brand'::classification_kind, 'Marcas', false)
) AS defaults(kind, label, hierarchical)
ON CONFLICT (tenant_id, kind) DO NOTHING;

INSERT INTO classifications (tenant_id, classification_type_id, name, slug)
SELECT DISTINCT product.tenant_id, type.id, product.category,
  lower(trim(both '-' FROM regexp_replace(product.category, '[^a-zA-Z0-9]+', '-', 'g')))
FROM products product
JOIN classification_types type ON type.tenant_id = product.tenant_id AND type.kind = 'category'
WHERE product.category IS NOT NULL AND product.category <> ''
ON CONFLICT (tenant_id, classification_type_id, parent_id, slug) DO NOTHING;

INSERT INTO product_classifications (tenant_id, product_id, classification_id, classification_type_id)
SELECT product.tenant_id, product.id, classification.id, type.id
FROM products product
JOIN classification_types type ON type.tenant_id = product.tenant_id AND type.kind = 'category'
JOIN classifications classification
  ON classification.tenant_id = product.tenant_id
  AND classification.classification_type_id = type.id
  AND classification.parent_id IS NULL
  AND classification.name = product.category
WHERE product.category IS NOT NULL AND product.category <> ''
ON CONFLICT DO NOTHING;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'classification_types', 'classifications', 'product_classifications',
    'inventory_sources', 'inventory_locations', 'inventory_balances',
    'inventory_external_references', 'inventory_movements',
    'inventory_reservations', 'inventory_reservation_items'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ippa_app;
REVOKE UPDATE, DELETE ON inventory_movements FROM ippa_app;
