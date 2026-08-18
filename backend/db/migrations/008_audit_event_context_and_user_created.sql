ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'user.created';

ALTER TABLE audit_events
  ADD COLUMN request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN session_id uuid REFERENCES user_sessions(id) ON DELETE SET NULL,
  ADD COLUMN ip_address inet,
  ADD COLUMN user_agent text;

ALTER TABLE audit_events
  ALTER COLUMN request_id DROP DEFAULT;

CREATE INDEX audit_events_tenant_request_idx ON audit_events (tenant_id, request_id, occurred_at DESC);
