import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import {
    deleteExpiredAiToolExecutionRows,
    failAiToolExecutionRow,
    findCachedAiToolExecutionRow,
    insertCachedAiToolExecutionRow,
    insertProcessingAiToolExecutionRow,
    succeedAiToolExecutionRow,
} from "@/models/aiToolExecutionsModel";
import type { AiProviderUsage } from "./types";

export interface AiExecutionIdentity {
    toolKey: string;
    toolVersion: string;
    provider: string;
    model: string;
    inputHash: string;
}

export interface AiExecutionStore {
    findCached(identity: AiExecutionIdentity, completedAfter: Date): Promise<{ id: string; output: unknown } | null>;
    createProcessing(identity: AiExecutionIdentity): Promise<string>;
    createCached(identity: AiExecutionIdentity, sourceExecutionId: string, durationMs: number): Promise<string>;
    succeed(params: {
        id: string;
        output: unknown;
        providerResponseId?: string;
        attemptCount: number;
        usage?: AiProviderUsage;
        durationMs: number;
    }): Promise<void>;
    fail(params: {
        id: string;
        errorCode: string;
        providerResponseId?: string;
        attemptCount: number;
        usage?: AiProviderUsage;
        durationMs: number;
    }): Promise<void>;
    cleanupExpired(createdBefore: Date): Promise<number>;
}

export function createDatabaseAiExecutionStore(tenant: Tenant, actor: ActorContext): AiExecutionStore {
    const actorSnapshot = { actorId: actor.userId, actorRole: actor.role };
    return {
        findCached: (identity, completedAfter) => withTenantTransaction(
            tenant,
            actor,
            (client) => findCachedAiToolExecutionRow(client, { ...identity, completedAfter }),
        ),
        createProcessing: (identity) => withTenantTransaction(
            tenant,
            actor,
            (client) => insertProcessingAiToolExecutionRow(client, { ...identity, ...actorSnapshot }),
        ),
        createCached: (identity, sourceExecutionId, durationMs) => withTenantTransaction(
            tenant,
            actor,
            (client) => insertCachedAiToolExecutionRow(client, {
                ...identity,
                ...actorSnapshot,
                sourceExecutionId,
                durationMs,
            }),
        ),
        succeed: (params) => withTenantTransaction(
            tenant,
            actor,
            (client) => succeedAiToolExecutionRow(client, params),
        ),
        fail: (params) => withTenantTransaction(
            tenant,
            actor,
            (client) => failAiToolExecutionRow(client, params),
        ),
        cleanupExpired: (createdBefore) => withTenantTransaction(
            tenant,
            actor,
            (client) => deleteExpiredAiToolExecutionRows(client, createdBefore),
        ),
    };
}
