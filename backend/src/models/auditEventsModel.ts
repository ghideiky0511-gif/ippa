import type { PoolClient } from 'pg';
import type { UserRole } from '@/lib/types';
import type { AuditAction, AuditEntityType } from '@/services/audit/actions';

export type AuditMetadata = Record<string, unknown>;

export interface NewAuditEvent {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  actorId: string;
  actorRole: UserRole;
  actorName: string;
  metadata?: AuditMetadata;
}

export async function insertAuditEvent(client: PoolClient, event: NewAuditEvent): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (tenant_id, action, entity_type, entity_id, actor_id, actor_role, actor_name, metadata)
     VALUES (app_tenant_id(), $1::audit_action, $2::audit_entity_type, $3, $4, $5::user_role, $6, $7::jsonb)`,
    [event.action, event.entityType, event.entityId, event.actorId, event.actorRole, event.actorName, JSON.stringify(event.metadata ?? {})],
  );
}
