import type { PoolClient } from 'pg';
import type { AuthUser } from '@/lib/types';
import { AUDIT_ENTITY_BY_ACTION, type AuditAction, type EntityForAuditAction } from './audit/actions';

type AuditMetadata = Record<string, unknown>;

export interface AuditEventInput<A extends AuditAction> {
  action: A;
  entityId: string;
  actor: Pick<AuthUser, 'id' | 'role' | 'name'>;
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
    `INSERT INTO audit_events (tenant_id, action, entity_type, entity_id, actor_id, actor_role, actor_name, metadata)
     VALUES (app_tenant_id(), $1::audit_action, $2::audit_entity_type, $3, $4, $5::user_role, $6, $7::jsonb)`,
    [
      event.action,
      AUDIT_ENTITY_BY_ACTION[event.action] as EntityForAuditAction<A>,
      event.entityId,
      event.actor.id,
      event.actor.role,
      event.actor.name,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}
