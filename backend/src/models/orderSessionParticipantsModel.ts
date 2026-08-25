import type { PoolClient } from "pg";

export interface OrderSessionParticipantRow {
    user_id: string;
    first_joined_at: Date;
    last_joined_at: Date;
    last_left_at: Date | null;
    join_count: number;
}

const participantFields = "user_id, first_joined_at, last_joined_at, last_left_at, join_count";

export async function upsertOrderSessionParticipantRow(
    client: PoolClient,
    sessionId: string,
    userId: string,
): Promise<OrderSessionParticipantRow> {
    const result = await client.query<OrderSessionParticipantRow>(
        `INSERT INTO order_session_participants (tenant_id, order_session_id, user_id)
         VALUES (app_tenant_id(), $1, $2)
         ON CONFLICT (tenant_id, order_session_id, user_id) DO UPDATE
           SET last_joined_at = now(), last_left_at = NULL,
               join_count = order_session_participants.join_count + 1
         RETURNING ${participantFields}`,
        [sessionId, userId],
    );
    return result.rows[0];
}

export async function markOrderSessionParticipantLeftRow(
    client: PoolClient,
    sessionId: string,
    userId: string,
): Promise<void> {
    await client.query(
        `UPDATE order_session_participants SET last_left_at = now()
         WHERE tenant_id = app_tenant_id() AND order_session_id = $1 AND user_id = $2`,
        [sessionId, userId],
    );
}

export async function listOrderSessionParticipantRows(
    client: PoolClient,
    sessionId: string,
): Promise<OrderSessionParticipantRow[]> {
    const result = await client.query<OrderSessionParticipantRow>(
        `SELECT ${participantFields} FROM order_session_participants
         WHERE tenant_id = app_tenant_id() AND order_session_id = $1
         ORDER BY last_joined_at DESC`,
        [sessionId],
    );
    return result.rows;
}
