import type { PoolClient } from 'pg';
import type { AuthUser } from '@/lib/types';
import { AUDIT_ENTITY_BY_ACTION, type AuditAction, type EntityForAuditAction } from './audit/actions';

type AuditMetadata = Record<string, unknown>;

export interface AuditRequestContext {
  requestId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEventInput<A extends AuditAction> {
  action: A;
  entityId: string;
  actor: Pick<AuthUser, 'id' | 'role' | 'name'>;
  context: AuditRequestContext;
  metadata?: AuditMetadata;
}

// Deve ser chamado dentro da mesma withTenantTransaction da mutação.
// Se a inserção falhar, a transação inteira sofre rollback e não existe
// alteração de negócio sem o respectivo rastro de auditoria.
// O tipo da entidade é derivado da ação registrada no catálogo para que
// cada service não precise repassar nem possa informar um tipo divergente.
// Esta é a única API de escrita de auditoria permitida aos services.
export async function recordAuditEvent<A extends AuditAction>(client: PoolClient, event: AuditEventInput<A>): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (
       tenant_id, action, entity_type, entity_id, actor_id, actor_role, actor_name,
       request_id, session_id, ip_address, user_agent, metadata
     ) VALUES (
       app_tenant_id(), $1::audit_action, $2::audit_entity_type, $3, $4, $5::user_role, $6,
       $7::uuid, $8::uuid, $9::inet, $10, $11::jsonb
     )`,
    [
      event.action,
      AUDIT_ENTITY_BY_ACTION[event.action] as EntityForAuditAction<A>,
      event.entityId,
      event.actor.id,
      event.actor.role,
      event.actor.name,
      event.context.requestId,
      event.context.sessionId ?? null,
      event.context.ipAddress ?? null,
      event.context.userAgent ?? null,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}
