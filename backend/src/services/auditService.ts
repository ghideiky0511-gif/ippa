import type { PoolClient } from 'pg';
import type { AuthUser } from '@/lib/types';
import { insertAuditEvent, type AuditMetadata } from '@/models/auditEventsModel';
import { AUDIT_ENTITY_BY_ACTION, type AuditAction, type EntityForAuditAction } from './audit/actions';

export interface AuditEventInput<A extends AuditAction> {
  action: A;
  entityType: EntityForAuditAction<A>;
  entityId: string;
  actor: Pick<AuthUser, 'id' | 'role' | 'name'>;
  metadata?: AuditMetadata;
}

// Deve ser chamado dentro da mesma withTenantTransaction da mutaÃ§Ã£o.
// Se a inserÃ§Ã£o falhar, a transaÃ§Ã£o inteira sofre rollback e nÃ£o existe
// alteraÃ§Ã£o de negÃ³cio sem o respectivo rastro de auditoria.
export async function recordAuditEvent<A extends AuditAction>(client: PoolClient, event: AuditEventInput<A>): Promise<void> {
  if (AUDIT_ENTITY_BY_ACTION[event.action] !== event.entityType) {
    throw new Error(`AUDIT_ENTITY_MISMATCH: ${event.action}`);
  }
  await insertAuditEvent(client, {
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    actorId: event.actor.id,
    actorRole: event.actor.role,
    actorName: event.actor.name,
    metadata: event.metadata,
  });
}
