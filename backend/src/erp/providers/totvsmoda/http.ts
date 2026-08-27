// Único transporte HTTP permitido para a API TOTVS Moda — porta http.py e as
// constantes de base.py. Camada pura: não conhece tenant nem banco, só sabe
// falar com a API externa e traduzir a resposta em erros tipados. Reporta
// cada requisição via ExternalApiCallReporter opcional (ver
// docs/external-api-observability.md) sem depender de tenant/banco.

import { logger } from "@/lib/logger";
import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import {
    TotvsModaAuthError,
    TotvsModaNotFoundError,
    TotvsModaResponseError,
    TotvsModaTransportError,
} from "./errors";

export const TOTVS_MODA_BASE_URL = "https://apitotvsmoda.bhan.com.br";
export const TOTVS_MODA_DEFAULT_TIMEOUT_MS = 20_000;
// Loga chamadas que demoram mais que isso mesmo quando bem-sucedidas -- serve
// pra identificar qual endpoint está perto do timeout antes dele virar erro.
const SLOW_REQUEST_THRESHOLD_MS = 8_000;

export const AUTH_TOKEN_PATH = "/api/totvsmoda/authorization/v2/token";
export const BRANCHES_LIST_PATH = "/api/totvsmoda/person/v2/branchesList";
export const BRANCHES_PATH = "/api/totvsmoda/person/v2/branches";
export const SALES_ORDER_SEARCH_PATH =
    "/api/totvsmoda/sales-order/v2/orders/search";
export const B2C_ORDERS_PATH = "/api/totvsmoda/sales-order/v2/b2c-orders";
export const ORDERS_CANCEL_PATH = "/api/totvsmoda/sales-order/v2/orders/cancel";
export const PRODUCTS_SEARCH_PATH = "/api/totvsmoda/product/v2/products/search";
export const PRODUCT_PRICES_SEARCH_PATH =
    "/api/totvsmoda/product/v2/prices/search";
export const PRODUCT_BALANCES_SEARCH_PATH =
    "/api/totvsmoda/product/v2/balances/search";
export const COMPOSITION_GROUP_PRODUCT_PATH =
    "/api/totvsmoda/product/v2/composition-group-product";
export const INDIVIDUALS_SEARCH_PATH =
    "/api/totvsmoda/person/v2/individuals/search";
export const LEGAL_ENTITIES_SEARCH_PATH =
    "/api/totvsmoda/person/v2/legal-entities/search";
export const REPRESENTATIVES_SEARCH_PATH =
    "/api/totvsmoda/person/v2/representatives/search";
export const CLASSIFICATIONS_PATH = "/api/totvsmoda/person/v2/classifications";
export const EMAIL_TYPES_PATH = "/api/totvsmoda/person/v2/email-types";
export const PHONE_TYPES_PATH = "/api/totvsmoda/person/v2/phone-types";
export const PERSON_STATISTICS_PATH =
    "/api/totvsmoda/person/v2/person-statistics";

function extractErrorMessage(payload: unknown, fallback: string): string {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const record = payload as Record<string, unknown>;
        const parts = [
            "message",
            "detailedMessage",
            "error",
            "detail",
            "mensagem",
        ]
            .map((key) => String(record[key] ?? "").trim())
            .filter(Boolean);
        if (parts.length) return parts.join(" — ");
    }
    if (Array.isArray(payload) && payload.length)
        return extractErrorMessage(payload[0], fallback);
    return String(fallback || "Erro na API TOTVS Moda.").trim();
}

export interface TotvsModaRequestOptions {
    token?: string;
    jsonBody?: unknown;
    formData?: Record<string, string>;
    params?: Record<string, string | number | undefined>;
    timeoutMs?: number;
    /** Nome da operação de negócio (ex.: "searchProducts") para o log de observabilidade. */
    operation?: string;
    reporter?: ExternalApiCallReporter;
}

export async function totvsModaRequest<T = unknown>(
    method: string,
    path: string,
    options: TotvsModaRequestOptions = {},
): Promise<T> {
    const {
        token,
        jsonBody,
        formData,
        params,
        timeoutMs = TOTVS_MODA_DEFAULT_TIMEOUT_MS,
        operation,
        reporter,
    } = options;
    const methodNorm = (method || "GET").trim().toUpperCase();
    const pathNorm = "/" + (path || "").trim().replace(/^\/+/, "");
    const url = new URL(
        `${TOTVS_MODA_BASE_URL.replace(/\/+$/, "")}${pathNorm}`,
    );
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) url.searchParams.set(key, String(value));
        }
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: string | undefined;
    if (formData !== undefined) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = new URLSearchParams(formData).toString();
    } else {
        headers["Content-Type"] = "application/json";
        if (jsonBody !== undefined) body = JSON.stringify(jsonBody);
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
            logger.warn(
                "totvsmoda-http",
                "Falha ao reportar chamada externa para observabilidade",
                {
                    endpoint: pathNorm,
                    error: (reportError as Error).message,
                },
            );
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
            ? `Tempo limite excedido ao chamar a API TOTVS Moda (${timeoutMs}ms).`
            : `Falha de rede na API TOTVS Moda: ${(exc as Error).message}`;
        logger.error("totvsmoda-http", message, {
            operation: operation || pathNorm,
            method: methodNorm,
            endpoint: pathNorm,
            durationMs: Date.now() - startedAt,
        });
        await report({
            statusCode: null,
            success: false,
            errorMessage: message,
            errorClass,
        });
        throw new TotvsModaTransportError(message, {
            endpoint: url.toString(),
        });
    } finally {
        clearTimeout(timer);
    }

    const durationMs = Date.now() - startedAt;
    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
        logger.warn("totvsmoda-http", "Chamada lenta à API TOTVS Moda", {
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
    const errorMessage = success
        ? undefined
        : extractErrorMessage(payload, responseText);

    await report({
        statusCode,
        success,
        errorMessage: errorMessage ?? null,
        errorClass: success ? null : "TotvsModaResponseError",
        responseBody: success ? null : responseText,
    });

    if (statusCode === 401 || statusCode === 403) {
        throw new TotvsModaAuthError(
            errorMessage || "Credenciais recusadas pelo TOTVS Moda.",
            {
                statusCode,
                endpoint: url.toString(),
                payload,
            },
        );
    }
    if (statusCode === 404) {
        throw new TotvsModaNotFoundError(
            errorMessage || "Recurso não encontrado no TOTVS Moda.",
            {
                statusCode,
                endpoint: url.toString(),
                payload,
            },
        );
    }
    if (!success) {
        throw new TotvsModaResponseError(
            errorMessage || `TOTVS Moda retornou HTTP ${statusCode}.`,
            {
                statusCode,
                endpoint: url.toString(),
                payload,
            },
        );
    }
    if (payload === undefined) {
        throw new TotvsModaResponseError(
            "TOTVS Moda retornou uma resposta que não é JSON.",
            {
                statusCode,
                endpoint: url.toString(),
            },
        );
    }
    return payload as T;
}
