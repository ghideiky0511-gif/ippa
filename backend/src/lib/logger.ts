// Logger mínimo, sem dependência externa: o app roda self-hosted (Docker/VM,
// processo Node de longa duração — ver docker-compose.yml), então stdout/
// stderr já é coletado pela infra de logs do container; gravar em arquivo
// (winston + fs) só adicionaria uma dependência sem necessidade. Formaliza o
// padrão "[scope] mensagem" que já aparecia solto em alguns console.error
// (ver lib/email.ts).

export type LogMeta = Record<string, unknown>;
type LogLevel = "info" | "warn" | "error";

function formatMetaValue(value: unknown): string {
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value !== "object" || value === null) return String(value);

    // O registro nunca pode falhar quando um erro inclui um objeto circular,
    // como Request ou Response.
    const seen = new WeakSet<object>();
    try {
        return JSON.stringify(value, (_key, nestedValue: unknown) => {
            if (typeof nestedValue === "bigint") return `${nestedValue}n`;
            if (nestedValue instanceof Error) {
                return { name: nestedValue.name, message: nestedValue.message, stack: nestedValue.stack };
            }
            if (typeof nestedValue === "object" && nestedValue !== null) {
                if (seen.has(nestedValue)) return "[Circular]";
                seen.add(nestedValue);
            }
            return nestedValue;
        });
    } catch (error) {
        return `[unserializable: ${error instanceof Error ? error.message : String(error)}]`;
    }
}

function serializeMeta(meta?: LogMeta): string {
    if (!meta) return "";
    return Object.entries(meta)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => `${key}=${formatMetaValue(value)}`)
        .join(" ");
}

function log(level: LogLevel, scope: string, message: string, meta?: LogMeta): void {
    const serialized = serializeMeta(meta);
    // Alguns coletores rotulam toda saida da aplicacao como "info". Manter o
    // nivel na linha tambem o deixa visivel e pesquisavel nesses casos.
    const line = `[${level.toUpperCase()}] [${scope}] ${message}${serialized ? ` ${serialized}` : ""}`;
    if (level === "error") { console.error(line); return; }
    if (level === "warn") { console.warn(line); return; }
    console.info(line);
}

export const logger = {
    info(scope: string, message: string, meta?: LogMeta): void { log("info", scope, message, meta); },
    warn(scope: string, message: string, meta?: LogMeta): void { log("warn", scope, message, meta); },
    error(scope: string, message: string, meta?: LogMeta): void { log("error", scope, message, meta); },
};

// Extrai os campos úteis de um erro do pg (code/detail/constraint/table) ou
// de um erro tipado de client HTTP externo (statusCode/endpoint — mesmo
// padrão de erpProviders/totvsmoda/client.ts e messaging/errors.ts) sem cada
// call site precisar checar o tipo na mão.
export function errorMeta(error: unknown): LogMeta {
    const err = error as
        | { message?: string; code?: string; detail?: string; constraint?: string; table?: string; statusCode?: number; endpoint?: string; cause?: unknown }
        | null;
    // `cause` (padrão do Error nativo, ex. `new Error(msg, { cause })`) costuma
    // guardar o erro de verdade por trás de um wrapper normalizado (ex.
    // AiProviderFailure só expõe `kind` como message — sem isto, uma falha de
    // schema na conversão pro provider vira "unavailable" sem nenhum rastro
    // de qual campo/regra causou).
    const cause = err?.cause;
    const causeMessage = cause instanceof Error
        ? cause.message
        : cause !== undefined && cause !== null ? String(cause) : undefined;
    return {
        error: err?.message ?? String(error),
        code: err?.code,
        detail: err?.detail,
        constraint: err?.constraint,
        table: err?.table,
        statusCode: err?.statusCode,
        endpoint: err?.endpoint,
        cause: causeMessage,
    };
}
