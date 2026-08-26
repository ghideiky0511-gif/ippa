import type { PoolClient } from "pg";

export interface NotificationRow {
  id: string; user_id: string; module: string; event: string; title: string; body: string;
  url: string; tag: string | null; data: Record<string, unknown>; read_at: Date | null;
  delivery_status: "pending" | "processing" | "sent" | "failed"; attempts: number;
  next_attempt_at: Date; created_at: Date;
}

export interface PushSubscriptionRow {
  id: string; endpoint: string; p256dh: string; auth: string;
}

export async function upsertPushSubscription(client: PoolClient, input: {
  userId: string; installationId: string; endpoint: string; p256dh: string; auth: string; userAgent?: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO notification_subscriptions
       (tenant_id, user_id, installation_id, endpoint, p256dh, auth, user_agent, active, last_seen_at)
     VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, true, now())
     ON CONFLICT (tenant_id, installation_id) DO UPDATE SET
       user_id = EXCLUDED.user_id, endpoint = EXCLUDED.endpoint, p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent, active = true, last_seen_at = now()`,
    [input.userId, input.installationId, input.endpoint, input.p256dh, input.auth, input.userAgent ?? null],
  );
}

export async function countActiveSubscriptions(client: PoolClient, userId: string, installationId?: string, endpoint?: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM notification_subscriptions
     WHERE tenant_id = app_tenant_id() AND user_id = $1 AND active
       AND ($2::text IS NULL OR installation_id = $2)
       AND ($3::text IS NULL OR endpoint = $3)`, [userId, installationId ?? null, endpoint ?? null],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function insertNotification(client: PoolClient, input: Omit<NotificationRow, "id" | "read_at" | "delivery_status" | "attempts" | "next_attempt_at" | "created_at"> & { idempotencyKey: string }): Promise<void> {
  await client.query(
    `INSERT INTO notifications (tenant_id, user_id, module, event, title, body, url, tag, data, idempotency_key)
     VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
    [input.user_id, input.module, input.event, input.title, input.body, input.url, input.tag, JSON.stringify(input.data), input.idempotencyKey],
  );
}

export async function listNotifications(client: PoolClient, userId: string, unreadOnly: boolean, limit: number): Promise<NotificationRow[]> {
  const result = await client.query<NotificationRow>(
    `SELECT id, user_id, module, event, title, body, url, tag, data, read_at, delivery_status, attempts, next_attempt_at, created_at
     FROM notifications WHERE tenant_id = app_tenant_id() AND user_id = $1
       AND ($2::boolean = false OR read_at IS NULL)
     ORDER BY created_at DESC LIMIT $3`, [userId, unreadOnly, limit],
  );
  return result.rows;
}

export async function notificationSummary(client: PoolClient, userId: string): Promise<{ total: number; unread: number }> {
  const result = await client.query<{ total: string; unread: string }>(
    `SELECT count(*)::text AS total, count(*) FILTER (WHERE read_at IS NULL)::text AS unread
     FROM notifications WHERE tenant_id = app_tenant_id() AND user_id = $1`, [userId],
  );
  return { total: Number(result.rows[0]?.total ?? 0), unread: Number(result.rows[0]?.unread ?? 0) };
}

export async function markNotificationRead(client: PoolClient, userId: string, notificationId: string): Promise<boolean> {
  const result = await client.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, now())
     WHERE tenant_id = app_tenant_id() AND user_id = $1 AND id = $2`, [userId, notificationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markAllNotificationsRead(client: PoolClient, userId: string): Promise<number> {
  const result = await client.query(
    `UPDATE notifications SET read_at = now() WHERE tenant_id = app_tenant_id() AND user_id = $1 AND read_at IS NULL`, [userId],
  );
  return result.rowCount ?? 0;
}

export async function claimPendingNotifications(client: PoolClient, limit: number): Promise<NotificationRow[]> {
  const result = await client.query<NotificationRow>(
    `WITH picked AS (
       SELECT id FROM notifications WHERE tenant_id = app_tenant_id() AND delivery_status = 'pending'
         AND next_attempt_at <= now() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT $1
     ) UPDATE notifications n SET delivery_status = 'processing', attempts = attempts + 1
       FROM picked WHERE n.id = picked.id
       RETURNING n.id, n.user_id, n.module, n.event, n.title, n.body, n.url, n.tag, n.data, n.read_at,
         n.delivery_status, n.attempts, n.next_attempt_at, n.created_at`, [limit],
  );
  return result.rows;
}

export async function activeSubscriptionsForUser(client: PoolClient, userId: string): Promise<PushSubscriptionRow[]> {
  const result = await client.query<PushSubscriptionRow>(
    `SELECT id, endpoint, p256dh, auth FROM notification_subscriptions
     WHERE tenant_id = app_tenant_id() AND user_id = $1 AND active`, [userId],
  );
  return result.rows;
}

export async function finishNotificationDelivery(client: PoolClient, id: string, status: "sent" | "failed" | "pending", response: Record<string, unknown>, error?: string): Promise<void> {
  await client.query(
    `UPDATE notifications SET delivery_status = $2::text, processed_at = CASE WHEN $2::text IN ('sent', 'failed') THEN now() ELSE NULL END,
       next_attempt_at = CASE WHEN $2::text = 'pending' THEN now() + (interval '1 minute' * LEAST(60, power(2, attempts))) ELSE next_attempt_at END,
       delivery_error = $3, provider_response = $4 WHERE tenant_id = app_tenant_id() AND id = $1`,
    [id, status, error ?? null, JSON.stringify(response)],
  );
}

export async function deactivateSubscription(client: PoolClient, id: string): Promise<void> {
  await client.query(`UPDATE notification_subscriptions SET active = false WHERE tenant_id = app_tenant_id() AND id = $1`, [id]);
}
