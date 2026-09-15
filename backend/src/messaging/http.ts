// Transporte HTTP do bippaMessagingClient.ts -- clone estrutural de
// backend/src/whatsapp/http.ts (fetch + AbortController com timeout, erros
// tipados por status, reporter opcional de observabilidade). Autentica com
// a API key de serviço do Catálogo (header X-Bippa-Api-Key, ver
// bippaAuthClient.ts) -- não há mais bearer humano nem troca OAuth contra o
// bippa-auth (esquema anterior, substituído pela API key estática).

import { logger } from "@/lib/logger";
import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import {
    BippaMessagingAuthError,
    BippaMessagingClientError,
    BippaMessagingResponseError,
    BippaMessagingTransportError,
} from "./errors";

export const BIPPA_MESSAGING_DEFAULT_TIMEOUT_MS = 15_000;
const SLOW_REQUEST_THRESHOLD_MS = 5_000;

export interface BippaMessagingRequestOptions {
    /** API key de serviço do Catálogo (bippaAuthClient.getApiKey()), sempre explícita, nunca lida de cookie/sessão aqui. */
    apiKey?: string;
    jsonBody?: unknown;
    params?: Record<string, string | number | undefined>;
    timeoutMs?: number;
    /** Nome da operação de negócio (ex.: "sendMessage") para o log de observabilidade. */
    operation?: string;
    reporter?: ExternalApiCallReporter;
    /** Serviço de destino, só para diferenciar mensagem de log/erro. */
    service: "bippa-messaging";
}

function extractError(payload: unknown): string | undefined {
    if (payload && typeof payload === "object") {
        const record = payload as Record<string, unknown>;
        if (typeof record.error === "string") return record.error;
        if (typeof record.error_description === "string") return record.error_description;
        if (typeof record.message === "string") return record.message;
    }
    return undefined;
}

export async function bippaMessagingRequest<T = unknown>(
    method: string,
    url: string,
    options: BippaMessagingRequestOptions,
): Promise<T> {
    const { apiKey, jsonBody, params, timeoutMs = BIPPA_MESSAGING_DEFAULT_TIMEOUT_MS, operation, reporter, service } = options;
    const methodNorm = (method || "GET").trim().toUpperCase();
    const target = new URL(url);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) target.searchParams.set(key, String(value));
        }
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["X-Bippa-Api-Key"] = apiKey;
    let body: string | undefined;
    if (jsonBody !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(jsonBody);
    }

    const startedAt = Date.now();
    async function report(entry: {
        statusCode: number | null;
        success: boolean;
        errorMessage?: string | null;
        errorClass?: string | null;
        responseBody?: string | null;
    }): Promise<void> {
        if (!reporter) return;
        try {
            await reporter({
                operation: operation || target.pathname,
                method: methodNorm,
                endpoint: target.toString(),
                endpointPath: target.pathname,
                durationMs: Date.now() - startedAt,
                requestPayload: jsonBody,
                ...entry,
            });
        } catch (reportError) {
            logger.warn("bippa-messaging-http", "Falha ao reportar chamada externa para observabilidade", {
                endpoint: target.pathname,
                error: (reportError as Error).message,
            });
        }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
        response = await fetch(target, {
            method: methodNorm,
            headers,
            body,
            signal: controller.signal,
        });
    } catch (exc) {
        const isTimeout = exc instanceof Error && exc.name === "AbortError";
        const errorClass = isTimeout ? "TimeoutError" : "ConnectionError";
        const message = isTimeout
            ? `Tempo limite excedido ao chamar ${service} (${timeoutMs}ms).`
            : `Falha de rede ao chamar ${service}: ${(exc as Error).message}`;
        logger.error("bippa-messaging-http", message, {
            operation: operation || target.pathname,
            method: methodNorm,
            endpoint: target.pathname,
            durationMs: Date.now() - startedAt,
        });
        await report({ statusCode: null, success: false, errorMessage: message, errorClass });
        throw new BippaMessagingTransportError(message, { endpoint: target.toString() });
    } finally {
        clearTimeout(timer);
    }

    const durationMs = Date.now() - startedAt;
    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
        logger.warn("bippa-messaging-http", `Chamada lenta a ${service}`, {
            operation: operation || target.pathname,
            method: methodNorm,
            endpoint: target.pathname,
            durationMs,
        });
    }

    const statusCode = response.status;
    const responseText = await response.text();
    let payload: unknown;
    try {
        payload = responseText ? JSON.parse(responseText) : {};
    } catch {
        payload = undefined;
    }
    const success = statusCode >= 200 && statusCode < 300;
    const errorMessage = success ? undefined : extractError(payload) || `${service} retornou HTTP ${statusCode}.`;

    await report({
        statusCode,
        success,
        errorMessage: errorMessage ?? null,
        errorClass: success ? null : "BippaMessagingResponseError",
        responseBody: success ? null : responseText,
    });

    if (statusCode === 401 || statusCode === 403) {
        throw new BippaMessagingAuthError(errorMessage || `Credenciais recusadas por ${service}.`, {
            statusCode,
            endpoint: target.toString(),
            payload,
        });
    }
    if (!success) {
        throw new BippaMessagingClientError(errorMessage || `${service} retornou HTTP ${statusCode}.`, {
            statusCode,
            endpoint: target.toString(),
            payload,
        });
    }
    if (payload === undefined) {
        throw new BippaMessagingResponseError(`${service} retornou uma resposta que não é JSON.`, {
            statusCode,
            endpoint: target.toString(),
        });
    }
    return payload as T;
}
