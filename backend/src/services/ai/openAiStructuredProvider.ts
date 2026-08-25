import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import type { AiProviderRequest, AiProviderResult, AiProviderUsage, AiStructuredProvider } from "./types";
import { AiProviderFailure } from "./types";

const REQUEST_TIMEOUT_MS = 20_000;

function responseUsage(response: {
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
    } | null;
}): AiProviderUsage | undefined {
    if (!response.usage) return undefined;
    return {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cachedInputTokens: response.usage.input_tokens_details?.cached_tokens,
    };
}

function normalizedProviderFailure(error: unknown): AiProviderFailure {
    if (error instanceof AiProviderFailure) return error;
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
        return new AiProviderFailure("timeout", { cause: error });
    }
    if (error instanceof OpenAI.APIError) {
        const status = error.status;
        if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
            return new AiProviderFailure("configuration", { cause: error });
        }
        if (status === 429) return new AiProviderFailure("rate_limit", { cause: error });
        return new AiProviderFailure("unavailable", { cause: error });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return new AiProviderFailure("invalid_output", { cause: error });
    }
    return new AiProviderFailure("unavailable", { cause: error });
}

export class OpenAiStructuredProvider implements AiStructuredProvider {
    async generateStructured<TOutput>(request: AiProviderRequest<TOutput>): Promise<AiProviderResult<TOutput>> {
        if (!request.apiKey) throw new AiProviderFailure("configuration");
        const client = new OpenAI({
            apiKey: request.apiKey,
            timeout: REQUEST_TIMEOUT_MS,
            maxRetries: 0,
        });

        try {
            const response = await client.responses.parse({
                model: request.model,
                store: false,
                instructions: request.instructions,
                input: request.prompt,
                max_output_tokens: request.maxOutputTokens,
                text: {
                    format: zodTextFormat(request.outputSchema, request.schemaName),
                },
            });
            const usage = responseUsage(response);
            const failureMeta = { providerResponseId: response.id, usage };
            const refusal = response.output
                .filter((item) => item.type === "message")
                .flatMap((item) => item.content)
                .find((content) => content.type === "refusal");
            if (refusal) throw new AiProviderFailure("refusal", failureMeta);
            if (response.status !== "completed") {
                throw new AiProviderFailure(
                    response.status === "incomplete" ? "incomplete" : "unavailable",
                    failureMeta,
                );
            }
            if (response.output_parsed === null) {
                throw new AiProviderFailure("invalid_output", failureMeta);
            }
            return {
                data: response.output_parsed,
                providerResponseId: response.id,
                usage,
            };
        } catch (error) {
            throw normalizedProviderFailure(error);
        }
    }
}
