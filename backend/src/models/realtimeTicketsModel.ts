import type { PoolClient } from "pg";
import type { AuthUser } from "@/lib/types";

export interface RealtimeTicketRow {
    id: string;
    order_session_id: string;
    user_id: string;
    role: AuthUser["role"];
}

export async function insertRealtimeTicketRow(
    client: PoolClient,
    orderSessionId: string,
    userId: string,
    role: AuthUser["role"],
    tokenHash: string,
    expiresAt: Date,
): Promise<void> {
    await client.query(
        `INSERT INTO realtime_tickets (tenant_id, order_session_id, user_id, role, token_hash, expires_at)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5)`,
        [orderSessionId, userId, role, tokenHash, expiresAt],
    );
}

/** Single-use: marca `used_at` na mesma query que valida validade, pra não dar corrida entre checar e consumir. */
export async function consumeRealtimeTicketRow(client: PoolClient, tokenHash: string): Promise<RealtimeTicketRow | null> {
    const result = await client.query<RealtimeTicketRow>(
        `UPDATE realtime_tickets SET used_at = now()
         WHERE tenant_id = app_tenant_id() AND token_hash = $1
           AND used_at IS NULL AND expires_at > now()
         RETURNING id, order_session_id, user_id, role`,
        [tokenHash],
    );
    return result.rows[0] ?? null;
}
