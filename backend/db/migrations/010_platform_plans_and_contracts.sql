CREATE TYPE platform_plan_code AS ENUM ('trial', 'essential', 'professional', 'enterprise');
CREATE TYPE tenant_contract_status AS ENUM ('draft', 'trialing', 'active', 'past_due', 'suspended', 'cancelled', 'expired');
CREATE TYPE tenant_contract_billing_cycle AS ENUM ('monthly', 'annual', 'custom');

CREATE TABLE platform_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code platform_plan_code NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES platform_plans(id) ON DELETE RESTRICT,
  status tenant_contract_status NOT NULL DEFAULT 'draft',
  billing_cycle tenant_contract_billing_cycle NOT NULL DEFAULT 'monthly',
  currency char(3) NOT NULL DEFAULT 'BRL',
  price_cents integer,
  starts_at timestamptz,
  ends_at timestamptz,
  cancelled_at timestamptz,
  external_reference text,
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (price_cents IS NULL OR price_cents >= 0),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX tenant_contracts_current_by_tenant_idx
  ON tenant_contracts (tenant_id, created_at DESC)
  WHERE status IN ('draft', 'trialing', 'active', 'past_due', 'suspended');

ALTER TABLE platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_contracts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON platform_plans, tenant_contracts FROM ippa_app;
GRANT SELECT, INSERT, UPDATE ON platform_plans, tenant_contracts TO ippa_control;
