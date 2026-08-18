import type { PoolClient } from "pg";
import type { AuthUser } from "@/lib/types";
import { insertAuditEventRow } from "@/models/auditModel";
import { AUDIT_ENTITY_BY_ACTION, type AuditAction } from "./actions";

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
    actor: Pick<AuthUser, "id" | "role" | "name">;
    context: AuditRequestContext;
    metadata?: AuditMetadata;
}

// A auditoria participa da mesma transação da mutação de negócio.
export async function recordAuditEvent<A extends AuditAction>(
    client: PoolClient,
    event: AuditEventInput<A>,
): Promise<void> {
    await insertAuditEventRow(client, {
        action: event.action,
        entityType: AUDIT_ENTITY_BY_ACTION[event.action],
        entityId: event.entityId,
        actorId: event.actor.id,
        actorRole: event.actor.role,
        actorName: event.actor.name,
        requestId: event.context.requestId,
        sessionId: event.context.sessionId,
        ipAddress: event.context.ipAddress,
        userAgent: event.context.userAgent,
        metadata: event.metadata ?? {},
    });
}
