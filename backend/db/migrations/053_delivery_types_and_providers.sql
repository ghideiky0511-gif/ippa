-- Separa o que o checkout oferece (tipo), quem executa (provider) e as
-- condições comerciais entre os dois (offering). freight_providers fica
-- congelada como estrutura legada: suas linhas retirada/padrao/expressa
-- misturavam esses três conceitos e continuam referenciadas pelo histórico.

CREATE TYPE delivery_fulfillment_mode AS ENUM ('pickup', 'address_delivery');
CREATE TYPE delivery_provider_kind AS ENUM ('internal', 'external');
CREATE TYPE delivery_pricing_mode AS ENUM ('fixed', 'external_quote');

CREATE TABLE delivery_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code IN ('pickup', 'address_delivery')),
  fulfillment_mode delivery_fulfillment_mode NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  CHECK (
    (code = 'pickup' AND fulfillment_mode = 'pickup') OR
    (code = 'address_delivery' AND fulfillment_mode = 'address_delivery')
  )
);

CREATE TABLE delivery_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  kind delivery_provider_kind NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  company_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, id) ON DELETE SET NULL,
  CHECK (kind = 'internal' OR company_id IS NULL)
);

CREATE TABLE delivery_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delivery_type_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  pricing_mode delivery_pricing_mode NOT NULL DEFAULT 'fixed',
  fixed_price numeric(12,2),
  eta_label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, delivery_type_id, provider_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, delivery_type_id) REFERENCES delivery_types(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, provider_id) REFERENCES delivery_providers(tenant_id, id) ON DELETE CASCADE,
  CHECK (
    (pricing_mode = 'fixed' AND fixed_price IS NOT NULL AND fixed_price >= 0) OR
    (pricing_mode = 'external_quote' AND fixed_price IS NULL)
  )
);

CREATE INDEX delivery_types_tenant_active_idx
  ON delivery_types (tenant_id, sort_order, code) WHERE active;
CREATE INDEX delivery_providers_tenant_active_idx
  ON delivery_providers (tenant_id, code) WHERE active;
CREATE INDEX delivery_offerings_tenant_active_idx
  ON delivery_offerings (tenant_id, delivery_type_id) WHERE active;

ALTER TABLE freight_quotes
  ADD COLUMN delivery_type_id uuid,
  ADD COLUMN delivery_offering_id uuid,
  ADD COLUMN delivery_provider_id uuid,
  ADD COLUMN delivery_fulfillment_mode delivery_fulfillment_mode,
  ADD COLUMN delivery_type_name text,
  ADD COLUMN delivery_provider_name text,
  ADD COLUMN delivery_destination_cep text;

ALTER TABLE freight_quotes
  ADD CONSTRAINT freight_quotes_delivery_type_fkey
    FOREIGN KEY (tenant_id, delivery_type_id) REFERENCES delivery_types(tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT freight_quotes_delivery_offering_fkey
    FOREIGN KEY (tenant_id, delivery_offering_id) REFERENCES delivery_offerings(tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT freight_quotes_delivery_provider_fkey
    FOREIGN KEY (tenant_id, delivery_provider_id) REFERENCES delivery_providers(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE order_sessions
  ADD COLUMN delivery_type_id uuid,
  ADD COLUMN delivery_offering_id uuid,
  ADD COLUMN delivery_provider_id uuid,
  ADD COLUMN delivery_fulfillment_mode delivery_fulfillment_mode,
  ADD COLUMN delivery_type_name text,
  ADD COLUMN delivery_provider_name text,
  ADD COLUMN delivery_destination_cep text;

ALTER TABLE order_sessions
  ADD CONSTRAINT order_sessions_delivery_type_fkey
    FOREIGN KEY (tenant_id, delivery_type_id) REFERENCES delivery_types(tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT order_sessions_delivery_offering_fkey
    FOREIGN KEY (tenant_id, delivery_offering_id) REFERENCES delivery_offerings(tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT order_sessions_delivery_provider_fkey
    FOREIGN KEY (tenant_id, delivery_provider_id) REFERENCES delivery_providers(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE order_freights
  ADD COLUMN delivery_type_id uuid,
  ADD COLUMN delivery_offering_id uuid,
  ADD COLUMN delivery_provider_id uuid,
  ADD COLUMN delivery_fulfillment_mode delivery_fulfillment_mode,
  ADD COLUMN delivery_type_name text,
  ADD COLUMN delivery_provider_name text;

ALTER TABLE order_freights
  ADD CONSTRAINT order_freights_delivery_type_fkey
    FOREIGN KEY (tenant_id, delivery_type_id) REFERENCES delivery_types(tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT order_freights_delivery_offering_fkey
    FOREIGN KEY (tenant_id, delivery_offering_id) REFERENCES delivery_offerings(tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT order_freights_delivery_provider_fkey
    FOREIGN KEY (tenant_id, delivery_provider_id) REFERENCES delivery_providers(tenant_id, id) ON DELETE SET NULL;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'delivery_type.updated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'delivery_type.activated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'delivery_type.deactivated';
ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'delivery_type';

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['delivery_types', 'delivery_providers', 'delivery_offerings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON delivery_types, delivery_providers, delivery_offerings TO ippa_app;
GRANT SELECT, INSERT, UPDATE ON delivery_types, delivery_providers, delivery_offerings TO ippa_control;

-- Provider interno: company matriz quando existe; nome do tenant como
-- fallback para tenants que ainda não sincronizaram/cadastraram empresas.
INSERT INTO delivery_providers (tenant_id, code, kind, name, company_id)
SELECT t.id, 'own_company', 'internal',
       COALESCE(NULLIF(m.nome_fantasia, ''), NULLIF(m.razao_social, ''), t.name),
       m.id
FROM tenants t
LEFT JOIN LATERAL (
  SELECT c.id, c.nome_fantasia, c.razao_social
  FROM companies c
  WHERE c.tenant_id = t.id AND c.is_matriz AND c.active
  LIMIT 1
) m ON true
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO delivery_types (tenant_id, code, fulfillment_mode, name, sort_order)
SELECT t.id, defaults.code, defaults.mode::delivery_fulfillment_mode, defaults.name, defaults.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('pickup', 'pickup', 'Retirada no local', 10),
  ('address_delivery', 'address_delivery', 'Entrega no endereço', 20)
) AS defaults(code, mode, name, sort_order)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO delivery_offerings (
  tenant_id, delivery_type_id, provider_id, pricing_mode, fixed_price, eta_label
)
SELECT dt.tenant_id, dt.id, dp.id, 'fixed',
       CASE dt.code WHEN 'pickup' THEN 0 ELSE 19.90 END,
       CASE dt.code WHEN 'pickup' THEN NULL ELSE '5 a 8 dias úteis' END
FROM delivery_types dt
JOIN delivery_providers dp ON dp.tenant_id = dt.tenant_id AND dp.code = 'own_company'
ON CONFLICT (tenant_id, delivery_type_id, provider_id) DO NOTHING;

-- Backfill dos snapshots conhecidos. Preço, prazo e label antigos não são
-- alterados: apenas acrescentamos a identidade normalizada.
UPDATE freight_quotes fq
SET delivery_type_id = dt.id,
    delivery_offering_id = dof.id,
    delivery_provider_id = dp.id,
    delivery_fulfillment_mode = dt.fulfillment_mode,
    delivery_type_name = dt.name,
    delivery_provider_name = dp.name
FROM freight_providers fp, delivery_types dt, delivery_providers dp, delivery_offerings dof
WHERE fq.provider_id = fp.id
  AND fp.tenant_id = fq.tenant_id
  AND fp.code IN ('retirada', 'padrao', 'expressa')
  AND dt.tenant_id = fq.tenant_id
  AND dt.code = CASE WHEN fp.code = 'retirada' THEN 'pickup' ELSE 'address_delivery' END
  AND dp.tenant_id = fq.tenant_id AND dp.code = 'own_company'
  AND dof.tenant_id = fq.tenant_id AND dof.delivery_type_id = dt.id AND dof.provider_id = dp.id;

UPDATE order_sessions s
SET delivery_type_id = dt.id,
    delivery_offering_id = dof.id,
    delivery_provider_id = dp.id,
    delivery_fulfillment_mode = dt.fulfillment_mode,
    delivery_type_name = dt.name,
    delivery_provider_name = dp.name
FROM freight_providers fp, delivery_types dt, delivery_providers dp, delivery_offerings dof
WHERE s.freight_provider_id = fp.id
  AND fp.tenant_id = s.tenant_id
  AND fp.code IN ('retirada', 'padrao', 'expressa')
  AND dt.tenant_id = s.tenant_id
  AND dt.code = CASE WHEN fp.code = 'retirada' THEN 'pickup' ELSE 'address_delivery' END
  AND dp.tenant_id = s.tenant_id AND dp.code = 'own_company'
  AND dof.tenant_id = s.tenant_id AND dof.delivery_type_id = dt.id AND dof.provider_id = dp.id;

UPDATE order_freights ofr
SET delivery_type_id = dt.id,
    delivery_offering_id = dof.id,
    delivery_provider_id = dp.id,
    delivery_fulfillment_mode = dt.fulfillment_mode,
    delivery_type_name = dt.name,
    delivery_provider_name = dp.name
FROM freight_providers fp, delivery_types dt, delivery_providers dp, delivery_offerings dof
WHERE ofr.provider_id = fp.id
  AND fp.tenant_id = ofr.tenant_id
  AND fp.code IN ('retirada', 'padrao', 'expressa')
  AND dt.tenant_id = ofr.tenant_id
  AND dt.code = CASE WHEN fp.code = 'retirada' THEN 'pickup' ELSE 'address_delivery' END
  AND dp.tenant_id = ofr.tenant_id AND dp.code = 'own_company'
  AND dof.tenant_id = ofr.tenant_id AND dof.delivery_type_id = dt.id AND dof.provider_id = dp.id;

UPDATE order_sessions s
SET delivery_destination_cep = fq.destination_cep
FROM freight_quotes fq
WHERE fq.tenant_id = s.tenant_id AND fq.id = s.freight_quote_id;

-- Sem provider legado conhecido, ainda dá para inferir apenas o tipo pelo
-- snapshot de comportamento; o provider permanece NULL de propósito.
UPDATE freight_quotes fq
SET delivery_type_id = dt.id,
    delivery_fulfillment_mode = dt.fulfillment_mode,
    delivery_type_name = dt.name
FROM delivery_types dt
WHERE fq.delivery_type_id IS NULL
  AND dt.tenant_id = fq.tenant_id
  AND dt.code = CASE WHEN fq.kind = 'pickup' THEN 'pickup' ELSE 'address_delivery' END;

UPDATE order_sessions s
SET delivery_type_id = dt.id,
    delivery_fulfillment_mode = dt.fulfillment_mode,
    delivery_type_name = dt.name
FROM delivery_types dt
WHERE s.delivery_type_id IS NULL AND s.freight_label IS NOT NULL
  AND dt.tenant_id = s.tenant_id
  AND dt.code = CASE WHEN s.freight_kind = 'pickup' THEN 'pickup' ELSE 'address_delivery' END;

UPDATE order_freights ofr
SET delivery_type_id = dt.id,
    delivery_fulfillment_mode = dt.fulfillment_mode,
    delivery_type_name = dt.name
FROM delivery_types dt
WHERE ofr.delivery_type_id IS NULL
  AND dt.tenant_id = ofr.tenant_id
  AND dt.code = CASE WHEN ofr.kind = 'pickup' THEN 'pickup' ELSE 'address_delivery' END;
