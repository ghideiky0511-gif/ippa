import type { z } from "zod";

export type AiProviderProfileKey = "catalogOrderResume";

export interface AiToolDefinition<TInput, TOutput> {
    key: string;
    version: string;
    inputSchema: z.ZodType<TInput>;
    outputSchema: z.ZodType<TOutput>;
    providerProfile: AiProviderProfileKey;
    instructions: string;
    buildPrompt: (input: TInput) => string;
    maxOutputTokens: number;
    cacheTtlMs?: number;
}

export interface AiProviderProfile {
    provider: "openai";
    apiKey: string;
    model: string;
}

export interface AiProviderUsage {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
}

export interface AiProviderRequest<TOutput> {
    apiKey: string;
    model: string;
    schemaName: string;
    outputSchema: z.ZodType<TOutput>;
    instructions: string;
    prompt: string;
    maxOutputTokens: number;
}

export interface AiProviderResult<TOutput> {
    data: TOutput;
    providerResponseId?: string;
    usage?: AiProviderUsage;
}

export type AiProviderFailureKind =
    | "configuration"
    | "timeout"
    | "rate_limit"
    | "unavailable"
    | "refusal"
    | "incomplete"
    | "invalid_output";

export class AiProviderFailure extends Error {
    constructor(
        public readonly kind: AiProviderFailureKind,
        options?: {
            providerResponseId?: string;
            usage?: AiProviderUsage;
            cause?: unknown;
        },
    ) {
        super(kind, options?.cause === undefined ? undefined : { cause: options.cause });
        this.name = "AiProviderFailure";
        this.providerResponseId = options?.providerResponseId;
        this.usage = options?.usage;
    }

    readonly providerResponseId?: string;
    readonly usage?: AiProviderUsage;
}

export interface AiStructuredProvider {
    generateStructured<TOutput>(request: AiProviderRequest<TOutput>): Promise<AiProviderResult<TOutput>>;
}

export interface AiToolRunResult<TOutput> {
    executionId: string;
    data: TOutput;
    source: "provider" | "cache";
}
