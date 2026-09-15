import type { PoolClient } from "pg";

export interface OrderAccessTokenRow {
    id: string;
    order_id: string;
    token_hash: string;
    expires_at: Date;
    consumed_at: Date | null;
    revoked_at: Date | null;
    access_session_hash: string | null;
    access_session_expires_at: Date | null;
}

const fields = "id, order_id, token_hash, expires_at, consumed_at, revoked_at, access_session_hash, access_session_expires_at";

export async function insertOrderAccessToken(
    client: PoolClient,
    input: { orderId: string; tokenHash: string; expiresAt: Date },
): Promise<OrderAccessTokenRow> {
    const result = await client.query<OrderAccessTokenRow>(
        `INSERT INTO order_access_tokens (tenant_id, order_id, token_hash, expires_at)
         VALUES (app_tenant_id(), $1, $2, $3)
         RETURNING ${fields}`,
        [input.orderId, input.tokenHash, input.expiresAt],
    );
    return result.rows[0];
}

export async function findOrderAccessTokenByHash(
    client: PoolClient,
    tokenHash: string,
    lock = false,
): Promise<OrderAccessTokenRow | null> {
    const result = await client.query<OrderAccessTokenRow>(
        `SELECT ${fields} FROM order_access_tokens
         WHERE tenant_id = app_tenant_id() AND token_hash = $1${lock ? " FOR UPDATE" : ""}`,
        [tokenHash],
    );
    return result.rows[0] ?? null;
}

export async function consumeOrderAccessToken(
    client: PoolClient,
    id: string,
    input: { sessionHash: string; sessionExpiresAt: Date },
): Promise<void> {
    await client.query(
        `UPDATE order_access_tokens
         SET consumed_at = now(),
             access_session_hash = $2,
             access_session_expires_at = $3,
             updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [id, input.sessionHash, input.sessionExpiresAt],
    );
}

export async function revokeOrderAccessTokenByHash(
    client: PoolClient,
    tokenHash: string,
): Promise<void> {
    await client.query(
        `UPDATE order_access_tokens SET revoked_at = now(), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash],
    );
}

export async function revokeOtherOrderAccessTokens(
    client: PoolClient,
    orderId: string,
    keepTokenHash: string,
): Promise<void> {
    await client.query(
        `UPDATE order_access_tokens SET revoked_at = now(), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND order_id = $1
           AND token_hash <> $2 AND revoked_at IS NULL`,
        [orderId, keepTokenHash],
    );
}

export async function findOrderAccessTokenBySessionHash(
    client: PoolClient,
    sessionHash: string,
): Promise<OrderAccessTokenRow | null> {
    const result = await client.query<OrderAccessTokenRow>(
        `SELECT ${fields} FROM order_access_tokens
         WHERE tenant_id = app_tenant_id()
           AND access_session_hash = $1
           AND access_session_expires_at > now()
           AND consumed_at IS NOT NULL
           AND revoked_at IS NULL`,
        [sessionHash],
    );
    return result.rows[0] ?? null;
}
