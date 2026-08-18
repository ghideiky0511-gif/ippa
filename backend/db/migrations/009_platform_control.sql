DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ippa_control') THEN
    CREATE ROLE ippa_control NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

ALTER ROLE ippa_control BYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE TYPE tenant_status AS ENUM ('active', 'inactive', 'archived');

ALTER TABLE tenants
  ADD COLUMN status tenant_status NOT NULL DEFAULT 'active';

UPDATE tenants
SET status = CASE WHEN active THEN 'active'::tenant_status ELSE 'inactive'::tenant_status END;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_reserved_slug_check CHECK (slug <> 'control');

CREATE TABLE platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_sessions_active_token_idx
  ON platform_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON platform_users, platform_sessions FROM ippa_app;
REVOKE INSERT, UPDATE, DELETE ON tenants FROM ippa_app;

GRANT USAGE ON SCHEMA public TO ippa_control;
GRANT SELECT, INSERT, UPDATE ON tenants TO ippa_control;
GRANT SELECT, INSERT, UPDATE ON platform_users, platform_sessions TO ippa_control;
GRANT SELECT, INSERT, UPDATE ON users, store_settings, inventory_locations TO ippa_control;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ippa_control;
