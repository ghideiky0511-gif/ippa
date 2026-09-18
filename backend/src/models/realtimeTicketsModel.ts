import type { PoolClient } from "pg";
import type { AuthUser } from "@/lib/types";

/** `order_session_id` NULL = ticket de atualizações (/atualizacoes, ou a
 * cliente entrando em /pedidos antes de ter pedido); preenchido = ticket de
 * uma sessão específica. Ver db/migrations/073_realtime_tickets_updates_channel.sql. */
export interface RealtimeTicketRow {
    id: string;
    order_session_id: string | null;
    user_id: string;
    role: AuthUser["role"];
}

/** Quais tickets um consumo aceita. /atualizacoes só aceita o de
 * atualizações; /pedidos aceita os dois (ver ticketService.ts). */
export type RealtimeTicketKind = "session" | "updates" | "any";

// Constantes, nunca entrada de quem chama — por isso podem ir interpoladas.
const KIND_FILTER: Record<RealtimeTicketKind, string> = {
    session: "AND order_session_id IS NOT NULL",
    updates: "AND order_session_id IS NULL",
    any: "",
};

export async function insertRealtimeTicketRow(
    client: PoolClient,
    orderSessionId: string | null,
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

/** Todo mint minera uma linha e nada mais apagava as vencidas; limpar as do
 * próprio usuário na mesma transação do mint mantém a tabela do tamanho dos
 * usuários ativos, sem job separado (índice em 073_realtime_tickets_updates_channel.sql). */
export async function deleteExpiredRealtimeTicketRows(client: PoolClient, userId: string): Promise<void> {
    await client.query(
        `DELETE FROM realtime_tickets
         WHERE tenant_id = app_tenant_id() AND user_id = $1 AND expires_at < now()`,
        [userId],
    );
}

/** Single-use: marca `used_at` na mesma query que valida validade, pra não dar corrida entre checar e consumir. */
export async function consumeRealtimeTicketRow(
    client: PoolClient,
    tokenHash: string,
    kind: RealtimeTicketKind,
): Promise<RealtimeTicketRow | null> {
    const result = await client.query<RealtimeTicketRow>(
        `UPDATE realtime_tickets SET used_at = now()
         WHERE tenant_id = app_tenant_id() AND token_hash = $1
           AND used_at IS NULL AND expires_at > now()
           ${KIND_FILTER[kind]}
         RETURNING id, order_session_id, user_id, role`,
        [tokenHash],
    );
    return result.rows[0] ?? null;
}
