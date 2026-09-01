// Único transporte HTTP permitido para a WhatsApp Cloud API (Graph API da
// Meta). Camada pura: não conhece tenant, vendedora nem banco, só sabe falar
// com a API externa e traduzir a resposta em erros tipados. Clone estrutural
// de erp/providers/totvsmoda/http.ts (fetch + AbortController com timeout,
// erros tipados por status, reporter opcional de observabilidade).

import { logger } from "@/lib/logger";
import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import {
    WhatsAppAuthError,
    WhatsAppClientError,
    WhatsAppResponseError,
    WhatsAppTransportError,
} from "./errors";
import type { WhatsAppApiErrorPayload } from "./types";

export const WHATSAPP_GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0";
export const WHATSAPP_GRAPH_BASE_URL = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}`;
export const WHATSAPP_DEFAULT_TIMEOUT_MS = 15_000;
const SLOW_REQUEST_THRESHOLD_MS = 5_000;

function extractError(payload: unknown): WhatsAppApiErrorPayload["error"] | undefined {
    if (payload && typeof payload === "object" && "error" in payload) {
        return (payload as WhatsAppApiErrorPayload).error;
    }
    return undefined;
}

export interface WhatsAppRequestOptions {
    /** Bearer token — token de sistema da vendedora, ou o token do app para /oauth/access_token. */
    token?: string;
    jsonBody?: unknown;
    params?: Record<string, string | number | undefined>;
    timeoutMs?: number;
    /** Nome da operação de negócio (ex.: "sendTemplateMessage") para o log de observabilidade. */
    operation?: string;
    reporter?: ExternalApiCallReporter;
}

export async function whatsAppGraphRequest<T = unknown>(
    method: string,
    path: string,
    options: WhatsAppRequestOptions = {},
): Promise<T> {
    const { token, jsonBody, params, timeoutMs = WHATSAPP_DEFAULT_TIMEOUT_MS, operation, reporter } = options;
    const methodNorm = (method || "GET").trim().toUpperCase();
    const pathNorm = "/" + (path || "").trim().replace(/^\/+/, "");
    const url = new URL(`${WHATSAPP_GRAPH_BASE_URL}${pathNorm}`);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) url.searchParams.set(key, String(value));
        }
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
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
                operation: operation || pathNorm,
                method: methodNorm,
                endpoint: url.toString(),
                endpointPath: pathNorm,
                durationMs: Date.now() - startedAt,
                requestPayload: jsonBody,
                ...entry,
            });
        } catch (reportError) {
            logger.warn("whatsapp-http", "Falha ao reportar chamada externa para observabilidade", {
                endpoint: pathNorm,
                error: (reportError as Error).message,
            });
        }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
        response = await fetch(url, {
            method: methodNorm,
            headers,
            body,
            signal: controller.signal,
        });
    } catch (exc) {
        const isTimeout = exc instanceof Error && exc.name === "AbortError";
        const errorClass = isTimeout ? "TimeoutError" : "ConnectionError";
        const message = isTimeout
            ? `Tempo limite excedido ao chamar a WhatsApp Cloud API (${timeoutMs}ms).`
            : `Falha de rede na WhatsApp Cloud API: ${(exc as Error).message}`;
        logger.error("whatsapp-http", message, {
            operation: operation || pathNorm,
            method: methodNorm,
            endpoint: pathNorm,
            durationMs: Date.now() - startedAt,
        });
        await report({ statusCode: null, success: false, errorMessage: message, errorClass });
        throw new WhatsAppTransportError(message, { endpoint: url.toString() });
    } finally {
        clearTimeout(timer);
    }

    const durationMs = Date.now() - startedAt;
    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
        logger.warn("whatsapp-http", "Chamada lenta à WhatsApp Cloud API", {
            operation: operation || pathNorm,
            method: methodNorm,
            endpoint: pathNorm,
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
    const metaError = extractError(payload);
    const errorMessage = success ? undefined : metaError?.message || `WhatsApp Cloud API retornou HTTP ${statusCode}.`;

    await report({
        statusCode,
        success,
        errorMessage: errorMessage ?? null,
        errorClass: success ? null : "WhatsAppResponseError",
        responseBody: success ? null : responseText,
    });

    if (statusCode === 401 || statusCode === 403) {
        throw new WhatsAppAuthError(errorMessage || "Credenciais recusadas pela Meta.", {
            statusCode,
            endpoint: url.toString(),
            payload,
            metaCode: metaError?.code,
            metaSubcode: metaError?.error_subcode,
        });
    }
    if (!success) {
        throw new WhatsAppClientError(errorMessage || `WhatsApp Cloud API retornou HTTP ${statusCode}.`, {
            statusCode,
            endpoint: url.toString(),
            payload,
            metaCode: metaError?.code,
            metaSubcode: metaError?.error_subcode,
        });
    }
    if (payload === undefined) {
        throw new WhatsAppResponseError("WhatsApp Cloud API retornou uma resposta que não é JSON.", {
            statusCode,
            endpoint: url.toString(),
        });
    }
    return payload as T;
}
