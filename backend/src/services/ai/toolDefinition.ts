import { z } from "zod";
import type { AiToolDefinition } from "./types";

type DefinitionInput<TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodObject> =
    Omit<AiToolDefinition<z.output<TInputSchema>, z.output<TOutputSchema>>, "inputSchema" | "outputSchema"> & {
        inputSchema: TInputSchema;
        outputSchema: TOutputSchema;
    };

export function defineAiTool<
    TInputSchema extends z.ZodTypeAny,
    TOutputSchema extends z.ZodObject,
>(definition: DefinitionInput<TInputSchema, TOutputSchema>): AiToolDefinition<
    z.output<TInputSchema>,
    z.output<TOutputSchema>
> {
    if (!/^[a-z][a-z0-9._-]{1,63}$/.test(definition.key)) {
        throw new Error(`Chave de ferramenta de IA inválida: ${definition.key}`);
    }
    if (!definition.version.trim()) throw new Error("Versão da ferramenta de IA obrigatória.");
    if (!definition.instructions.trim()) throw new Error("Instruções da ferramenta de IA obrigatórias.");
    if (!Number.isInteger(definition.maxOutputTokens) || definition.maxOutputTokens <= 0) {
        throw new Error("maxOutputTokens deve ser um inteiro positivo.");
    }
    if (definition.cacheTtlMs !== undefined && (!Number.isFinite(definition.cacheTtlMs) || definition.cacheTtlMs <= 0)) {
        throw new Error("cacheTtlMs deve ser positivo quando informado.");
    }
    return Object.freeze(definition) as unknown as AiToolDefinition<
        z.output<TInputSchema>,
        z.output<TOutputSchema>
    >;
}
