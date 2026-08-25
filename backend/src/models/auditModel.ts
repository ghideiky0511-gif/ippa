import type { PoolClient } from "pg";

export interface AuditEventRowInput {
    action: string; entityType: string; entityId: string; actorId: string;
    actorRole: string; actorName: string; requestId: string; sessionId?: string;
    ipAddress?: string; userAgent?: string; metadata: Record<string, unknown>;
}

export async function insertAuditEventRow(client: PoolClient, event: AuditEventRowInput): Promise<void> {
    await client.query(
        `INSERT INTO audit_events (
           tenant_id, action, entity_type, entity_id, actor_id, actor_role, actor_name,
           request_id, session_id, ip_address, user_agent, metadata
         ) VALUES (
           app_tenant_id(), $1::audit_action, $2::audit_entity_type, $3, $4, $5::user_role, $6,
           $7::uuid, $8::uuid, $9::inet, $10, $11::jsonb
         )`,
        [event.action, event.entityType, event.entityId, event.actorId, event.actorRole,
         event.actorName, event.requestId, event.sessionId ?? null, event.ipAddress ?? null,
         event.userAgent ?? null, JSON.stringify(event.metadata)],
    );
}
