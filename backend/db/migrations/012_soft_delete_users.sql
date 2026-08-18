ALTER TABLE users ADD COLUMN deleted_at timestamptz;

ALTER TABLE users DROP CONSTRAINT users_tenant_id_email_key;
CREATE UNIQUE INDEX users_tenant_email_active_key
  ON users (tenant_id, email) WHERE deleted_at IS NULL;

CREATE INDEX users_tenant_active_role_idx
  ON users (tenant_id, role) WHERE deleted_at IS NULL;
