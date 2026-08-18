-- Motor de integração ERP multiprovider: config por tenant, filiais
-- ("empresas") e reconciliação de ID externo para produtos/pedidos/
-- clientes/empresas sincronizados de um ERP. Generaliza o padrão já usado
-- por inventory_sources/inventory_external_references (migration 006) para
-- além de estoque.

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'company.created';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'company.updated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'erp_integration.configured';
ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'company';
ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'erp_integration';

-- Config de qual ERP cada tenant usa. `provider` é texto livre validado por
-- union no TypeScript (erp/types.ts), não enum de banco, para não exigir
-- migration a cada novo provider suportado. `credentials` guarda segredo em
-- texto claro por enquanto — criptografia em repouso/secrets manager fica
-- como endurecimento futuro, fora do escopo deste scaffold.
CREATE TABLE tenant_erp_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(credentials) = 'object'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
-- Um provider ativo por vez por tenant (o motor troca, não acumula).
CREATE UNIQUE INDEX tenant_erp_integrations_one_active_idx
  ON tenant_erp_integrations (tenant_id) WHERE active;

-- Filiais/multi-empresa dentro do ERP de um tenant (matriz + filiais).
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cnpj text NOT NULL,
  razao_social text NOT NULL,
  nome_fantasia text,
  inscricao_estadual text,
  is_matriz boolean NOT NULL DEFAULT false,
  cep text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cnpj),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX companies_one_matriz_per_tenant_idx
  ON companies (tenant_id) WHERE is_matriz;

-- Reconciliação de ID externo por entidade sincronizada do ERP, para upsert
-- idempotente (evita duplicar produto/pedido/cliente/empresa a cada sync).
CREATE TABLE erp_external_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('product', 'order', 'client', 'company')),
  internal_id uuid NOT NULL,
  external_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, integration_id) REFERENCES tenant_erp_integrations(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, integration_id, entity_type, external_id),
  UNIQUE (tenant_id, integration_id, entity_type, internal_id)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tenant_erp_integrations', 'companies', 'erp_external_references']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_erp_integrations, companies, erp_external_references TO ippa_app;
