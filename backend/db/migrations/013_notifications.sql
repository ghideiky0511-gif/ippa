CREATE TABLE notification_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id varchar(120) NOT NULL,
  endpoint text NOT NULL,
  p256dh varchar(255) NOT NULL,
  auth varchar(255) NOT NULL,
  user_agent text,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, installation_id),
  UNIQUE (tenant_id, endpoint)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module varchar(100) NOT NULL,
  event varchar(120) NOT NULL,
  title varchar(180) NOT NULL,
  body text NOT NULL,
  url text NOT NULL DEFAULT '/',
  tag varchar(120),
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  read_at timestamptz,
  delivery_status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'processing', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  delivery_error text,
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_response) = 'object'),
  idempotency_key varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX notification_subscriptions_user_active_idx
  ON notification_subscriptions (tenant_id, user_id) WHERE active;
CREATE INDEX notifications_inbox_idx
  ON notifications (tenant_id, user_id, created_at DESC);
CREATE INDEX notifications_unread_idx
  ON notifications (tenant_id, user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_dispatch_idx
  ON notifications (tenant_id, delivery_status, next_attempt_at)
  WHERE delivery_status IN ('pending', 'processing');

ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_subscriptions_tenant_isolation ON notification_subscriptions
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_tenant_isolation ON notifications
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
