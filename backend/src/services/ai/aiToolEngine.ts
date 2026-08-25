import { createHash } from "node:crypto";
import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { logger } from "@/lib/logger";
import { ServiceError, ValidationError } from "@/services/shared/errors";
import { resolveAiProviderProfile } from "./config";
import { createDatabaseAiExecutionStore, type AiExecutionIdentity, type AiExecutionStore } from "./executionStore";
import { OpenAiStructuredProvider } from "./openAiStructuredProvider";
import { resolveAiToolPrompt, type ResolvedAiToolPrompt } from "./promptManagementService";
import type {
    AiProviderFailureKind,
    AiProviderProfile,
    AiProviderProfileKey,
    AiStructuredProvider,
    AiToolDefinition,
    AiToolRunResult,
} from "./types";
import { AiProviderFailure } from "./types";

const HISTORY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 250;
const lastCleanupByTenant = new Map<string, number>();

function canonicalValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, canonicalValue(item)]),
        );
    }
    return value;
}

export function hashAiToolInput(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex");
}

const ERROR_BY_FAILURE: Record<AiProviderFailureKind, { code: string; status: number }> = {
    configuration: { code: "AI_NOT_CONFIGURED", status: 500 },
    timeout: { code: "AI_PROVIDER_TIMEOUT", status: 504 },
    rate_limit: { code: "AI_PROVIDER_RATE_LIMITED", status: 503 },
    unavailable: { code: "AI_PROVIDER_UNAVAILABLE", status: 503 },
    refusal: { code: "AI_PROVIDER_REFUSED", status: 502 },
    incomplete: { code: "AI_PROVIDER_INCOMPLETE", status: 502 },
    invalid_output: { code: "AI_PROVIDER_INVALID_OUTPUT", status: 502 },
};

function serviceErrorForFailure(failure: AiProviderFailure): ServiceError {
    const normalized = ERROR_BY_FAILURE[failure.kind];
    return new ServiceError(normalized.code, normalized.status);
}

function shouldRetry(failure: AiProviderFailure): boolean {
    return failure.kind === "timeout" || failure.kind === "rate_limit" || failure.kind === "unavailable";
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export interface AiToolRunnerDependencies {
    provider: AiStructuredProvider;
    storeFactory: (tenant: Tenant, actor: ActorContext) => AiExecutionStore;
    resolveProfile: (profile: AiProviderProfileKey) => AiProviderProfile;
    resolvePrompt: <TInput, TOutput>(
        tenant: Tenant,
        actor: ActorContext,
        tool: AiToolDefinition<TInput, TOutput>,
    ) => Promise<ResolvedAiToolPrompt>;
    now: () => Date;
    sleep: (milliseconds: number) => Promise<void>;
}

export function createAiToolRunner(overrides: Partial<AiToolRunnerDependencies> = {}) {
    const dependencies: AiToolRunnerDependencies = {
        provider: overrides.provider ?? new OpenAiStructuredProvider(),
        storeFactory: overrides.storeFactory ?? createDatabaseAiExecutionStore,
        resolveProfile: overrides.resolveProfile ?? resolveAiProviderProfile,
        resolvePrompt: overrides.resolvePrompt ?? resolveAiToolPrompt,
        now: overrides.now ?? (() => new Date()),
        sleep: overrides.sleep ?? sleep,
    };

    return async function run<TInput, TOutput>(
        tenant: Tenant,
        actor: ActorContext,
        tool: AiToolDefinition<TInput, TOutput>,
        rawInput: unknown,
    ): Promise<AiToolRunResult<TOutput>> {
        const parsedInput = tool.inputSchema.safeParse(rawInput);
        if (!parsedInput.success) {
            throw new ValidationError(
                "AI_TOOL_INVALID_INPUT",
                "Entrada inválida para a ferramenta de IA.",
                parsedInput.error.issues,
            );
        }

        const startedAt = dependencies.now();
        const profile = dependencies.resolveProfile(tool.providerProfile);
        const prompt = await dependencies.resolvePrompt(tenant, actor, tool);
        const identity: AiExecutionIdentity = {
            toolKey: tool.key,
            toolVersion: tool.version,
            promptRevision: prompt.revision,
            promptVersionId: prompt.promptVersionId,
            provider: profile.provider,
            model: profile.model,
            inputHash: hashAiToolInput(parsedInput.data),
        };
        const store = dependencies.storeFactory(tenant, actor);

        const previousCleanup = lastCleanupByTenant.get(tenant.id) ?? 0;
        if (startedAt.getTime() - previousCleanup >= CLEANUP_INTERVAL_MS) {
            lastCleanupByTenant.set(tenant.id, startedAt.getTime());
            const cutoff = new Date(startedAt.getTime() - HISTORY_RETENTION_MS);
            store.cleanupExpired(cutoff).catch(() => {
                logger.warn("AI_TOOL", "Falha ao limpar histórico expirado", { tenantId: tenant.id });
            });
        }

        if (tool.cacheTtlMs !== undefined) {
            const completedAfter = new Date(startedAt.getTime() - tool.cacheTtlMs);
            const cached = await store.findCached(identity, completedAfter);
            if (cached) {
                const parsedCached = tool.outputSchema.safeParse(cached.output);
                if (parsedCached.success) {
                    const durationMs = Math.max(0, dependencies.now().getTime() - startedAt.getTime());
                    const executionId = await store.createCached(identity, cached.id, durationMs);
                    return { executionId, data: parsedCached.data, source: "cache" };
                }
            }
        }

        const executionId = await store.createProcessing(identity);
        let attemptCount = 0;
        try {
            while (attemptCount < 2) {
                attemptCount += 1;
                try {
                    const result = await dependencies.provider.generateStructured({
                        apiKey: profile.apiKey,
                        model: profile.model,
                        schemaName: tool.key.replace(/[^a-zA-Z0-9_-]/g, "_"),
                        outputSchema: tool.outputSchema,
                        instructions: prompt.instructions,
                        prompt: tool.buildPrompt(parsedInput.data),
                        maxOutputTokens: tool.maxOutputTokens,
                    });
                    const validated = tool.outputSchema.safeParse(result.data);
                    if (!validated.success) {
                        throw new AiProviderFailure("invalid_output", {
                            providerResponseId: result.providerResponseId,
                            usage: result.usage,
                            cause: validated.error,
                        });
                    }
                    const durationMs = Math.max(0, dependencies.now().getTime() - startedAt.getTime());
                    await store.succeed({
                        id: executionId,
                        output: validated.data,
                        providerResponseId: result.providerResponseId,
                        attemptCount,
                        usage: result.usage,
                        durationMs,
                    });
                    return { executionId, data: validated.data, source: "provider" };
                } catch (error) {
                    const failure = error instanceof AiProviderFailure
                        ? error
                        : new AiProviderFailure("unavailable", { cause: error });
                    if (attemptCount < 2 && shouldRetry(failure)) {
                        await dependencies.sleep(RETRY_DELAY_MS);
                        continue;
                    }
                    throw failure;
                }
            }
            throw new AiProviderFailure("unavailable");
        } catch (error) {
            const failure = error instanceof AiProviderFailure
                ? error
                : new AiProviderFailure("unavailable", { cause: error });
            const normalized = serviceErrorForFailure(failure);
            const durationMs = Math.max(0, dependencies.now().getTime() - startedAt.getTime());
            try {
                await store.fail({
                    id: executionId,
                    errorCode: normalized.code,
                    providerResponseId: failure.providerResponseId,
                    attemptCount,
                    usage: failure.usage,
                    durationMs,
                });
            } catch {
                logger.warn("AI_TOOL", "Falha ao registrar execução malsucedida", {
                    tenantId: tenant.id,
                    tool: tool.key,
                    errorCode: normalized.code,
                });
            }
            throw normalized;
        }
    };
}

export const runAiTool = createAiToolRunner();
