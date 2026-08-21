// Logger mínimo, sem dependência externa: o app roda self-hosted (Docker/VM,
// processo Node de longa duração — ver docker-compose.yml), então stdout/
// stderr já é coletado pela infra de logs do container; gravar em arquivo
// (winston + fs) só adicionaria uma dependência sem necessidade. Formaliza o
// padrão "[scope] mensagem" que já aparecia solto em alguns console.error
// (ver lib/email.ts).

export type LogMeta = Record<string, unknown>;

function serializeMeta(meta?: LogMeta): string {
    if (!meta) return "";
    return Object.entries(meta)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" ");
}

function log(level: "info" | "warn" | "error", scope: string, message: string, meta?: LogMeta): void {
    const serialized = serializeMeta(meta);
    const line = `[${scope}] ${message}${serialized ? ` ${serialized}` : ""}`;
    if (level === "error") { console.error(line); return; }
    if (level === "warn") { console.warn(line); return; }
    console.info(line);
}

export const logger = {
    info(scope: string, message: string, meta?: LogMeta): void { log("info", scope, message, meta); },
    warn(scope: string, message: string, meta?: LogMeta): void { log("warn", scope, message, meta); },
    error(scope: string, message: string, meta?: LogMeta): void { log("error", scope, message, meta); },
};

// Extrai os campos úteis de um erro do pg (code/detail/constraint/table)
// sem cada call site precisar checar o tipo na mão.
export function errorMeta(error: unknown): LogMeta {
    const err = error as { message?: string; code?: string; detail?: string; constraint?: string; table?: string } | null;
    return {
        error: err?.message ?? String(error),
        code: err?.code,
        detail: err?.detail,
        constraint: err?.constraint,
        table: err?.table,
    };
}
