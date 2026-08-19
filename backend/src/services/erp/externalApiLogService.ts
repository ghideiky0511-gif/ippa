// Observabilidade de chamadas a APIs externas (ERP, etc.): grava cada
// requisição em external_api_request_log e mantém um snapshot por provider
// em external_api_provider_status, alertando administradores quando um
// provider transiciona para um estado problemático.
//
// Porte de external_api_request_log.py / external_api_provider_status.py:
// as duas escritas (log da requisição e snapshot do provider) permanecem
// como duas transações independentes — uma falha ao atualizar o snapshot
// nunca deve desfazer o registro de que a requisição aconteceu.

import type { PoolClient } from "pg";
import type { Tenant, ActorContext } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { logger, errorMeta } from "@/lib/logger";
import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import { notifyAdmins } from "@/services/notifications/pushNotificationService";
import {
    insertExternalApiRequestLogRow,
    findProviderStatusRowForUpdate,
    upsertProviderStatusOperationalRow,
    upsertProviderStatusProblemRow,
    listProviderStatusRows,
    type ExternalApiProviderStatusRow,
    type ExternalApiProviderStatusValue,
} from "@/models/externalApiLogModel";

export const PROVIDER_STATUS = {
    OPERACIONAL: "operacional",
    DEGRADADO: "degradado",
    INDISPONIVEL: "indisponivel",
    MANUTENCAO: "manutencao",
    DESCONHECIDO: "desconhecido",
} as const satisfies Record<string, ExternalApiProviderStatusValue>;

const FAILURE_STATUS_CODES_INDISPONIVEIS = new Set([502, 503, 504]);
const FAILURE_STATUS_CODES_DEGRADADOS = new Set([500, 501, 505, 506, 507, 508, 510, 511, 429]);
const PROBLEM_STATUSES = new Set<ExternalApiProviderStatusValue>([
    PROVIDER_STATUS.DEGRADADO,
    PROVIDER_STATUS.INDISPONIVEL,
    PROVIDER_STATUS.MANUTENCAO,
    PROVIDER_STATUS.DESCONHECIDO,
]);
const PROVIDER_LABELS: Record<string, string> = { vesti: "Vesti" };

function truncateText(value: string | null | undefined, limit = 1200): string | null {
    if (!value) return null;
    const collapsed = String(value).split(/\s+/).filter(Boolean).join(" ");
    if (collapsed.length <= limit) return collapsed;
    return `${collapsed.slice(0, limit)}...(truncado)`;
}

function normalizeProvider(provider: string | null | undefined): string {
    return String(provider ?? "").trim().toLowerCase();
}

function labelProvider(provider: string): string {
    const providerNorm = normalizeProvider(provider);
    if (PROVIDER_LABELS[providerNorm]) return PROVIDER_LABELS[providerNorm];
    return providerNorm ? providerNorm[0].toUpperCase() + providerNorm.slice(1) : "Provedor";
}

function statusIsProblem(status: string | null | undefined): boolean {
    return PROBLEM_STATUSES.has(String(status ?? "").trim().toLowerCase() as ExternalApiProviderStatusValue);
}

function shouldNotifyTransition(
    previousStatus: string | null,
    previousErrorCode: string | null,
    currentStatus: string,
    currentErrorCode: string | null,
): boolean {
    if (!statusIsProblem(currentStatus)) return false;
    if (!statusIsProblem(previousStatus)) return true;
    const previousNorm = String(previousStatus ?? "").trim().toLowerCase();
    const currentNorm = String(currentStatus ?? "").trim().toLowerCase();
    if (previousNorm !== currentNorm) return true;
    return String(previousErrorCode ?? "").trim() !== String(currentErrorCode ?? "").trim();
}

function buildPublicMessage(provider: string, status: string): string {
    const providerLabel = labelProvider(provider);
    const statusNorm = String(status ?? "").trim().toLowerCase();
    const message =
        statusNorm === PROVIDER_STATUS.INDISPONIVEL ? "O provedor está indisponível no momento."
        : statusNorm === PROVIDER_STATUS.DEGRADADO ? "O provedor está instável no momento."
        : statusNorm === PROVIDER_STATUS.MANUTENCAO ? "O provedor está em manutenção no momento."
        : "O provedor apresentou um problema operacional.";
    return `${providerLabel}: ${message}`;
}

function labelStatusAlerta(status: string): string {
    const statusNorm = String(status ?? "").trim().toLowerCase();
    if (statusNorm === PROVIDER_STATUS.INDISPONIVEL) return "indisponível";
    if (statusNorm === PROVIDER_STATUS.DEGRADADO) return "instável";
    if (statusNorm === PROVIDER_STATUS.MANUTENCAO) return "em manutenção";
    return "com problema";
}

export interface ProviderEventClassification {
    status: ExternalApiProviderStatusValue;
    lastSuccessAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorCode: string | null;
    lastErrorSummary: string | null;
}

export function classifyProviderEvent(input: {
    statusCode: number | null; success: boolean; errorMessage?: string | null; errorClass?: string | null;
}): ProviderEventClassification | null {
    const statusNum = input.statusCode !== null && input.statusCode !== undefined ? Number(input.statusCode) : null;
    const now = new Date();

    if (input.success && statusNum !== null && statusNum >= 200 && statusNum < 300) {
        return {
            status: PROVIDER_STATUS.OPERACIONAL,
            lastSuccessAt: now, lastErrorAt: null, lastErrorCode: null, lastErrorSummary: null,
        };
    }

    if (statusNum === 400 || statusNum === 404) return null;

    const summary = truncateText(input.errorMessage || input.errorClass || `HTTP ${statusNum ?? "desconhecido"}`, 500);
    const errorCode = truncateText(statusNum !== null ? String(statusNum) : input.errorClass || "unknown", 40);

    if (statusNum !== null && FAILURE_STATUS_CODES_INDISPONIVEIS.has(statusNum)) {
        return { status: PROVIDER_STATUS.INDISPONIVEL, lastSuccessAt: null, lastErrorAt: now, lastErrorCode: errorCode, lastErrorSummary: summary };
    }
    if (statusNum !== null && FAILURE_STATUS_CODES_DEGRADADOS.has(statusNum)) {
        return { status: PROVIDER_STATUS.DEGRADADO, lastSuccessAt: null, lastErrorAt: now, lastErrorCode: errorCode, lastErrorSummary: summary };
    }

    if (input.errorClass) {
        const errorClassNorm = String(input.errorClass).trim().toLowerCase();
        if (errorClassNorm.includes("timeout") || errorClassNorm.includes("connection") || errorClassNorm.includes("proxy")) {
            return {
                status: PROVIDER_STATUS.INDISPONIVEL, lastSuccessAt: null, lastErrorAt: now,
                lastErrorCode: truncateText(input.errorClass, 40), lastErrorSummary: summary,
            };
        }
    }

    if (input.errorMessage || input.errorClass || statusNum !== null) {
        return { status: PROVIDER_STATUS.DESCONHECIDO, lastSuccessAt: null, lastErrorAt: now, lastErrorCode: errorCode, lastErrorSummary: summary };
    }

    return null;
}

export interface ProviderEventResult {
    updated: boolean;
    notify: boolean;
    provider?: string;
    status?: ExternalApiProviderStatusValue;
    publicMessage?: string | null;
    requestLogId?: string | null;
}

/** Deve rodar dentro da mesma transação/`client` do início ao fim: a leitura FOR UPDATE
 * e o upsert precisam ver o mesmo snapshot para `shouldNotifyTransition` comparar corretamente. */
export async function registerProviderEvent(client: PoolClient, params: {
    provider: string; requestLogId: string | null; statusCode: number | null; success: boolean;
    errorMessage?: string | null; errorClass?: string | null;
}): Promise<ProviderEventResult> {
    const providerNorm = normalizeProvider(params.provider);
    if (!providerNorm) return { updated: false, notify: false };

    const previousRow = await findProviderStatusRowForUpdate(client, providerNorm).catch(() => null);

    const classification = classifyProviderEvent({
        statusCode: params.statusCode, success: params.success,
        errorMessage: params.errorMessage, errorClass: params.errorClass,
    });
    if (!classification) return { updated: false, notify: false };

    const status = classification.status;
    const publicMessage = statusIsProblem(status) ? buildPublicMessage(providerNorm, status) : null;

    if (status === PROVIDER_STATUS.OPERACIONAL) {
        await upsertProviderStatusOperationalRow(client, {
            provider: providerNorm,
            lastSuccessAt: classification.lastSuccessAt ?? new Date(),
            lastRequestLogId: params.requestLogId,
        });
        return { updated: true, notify: false, provider: providerNorm, status };
    }

    await upsertProviderStatusProblemRow(client, {
        provider: providerNorm, status,
        lastErrorAt: classification.lastErrorAt ?? new Date(),
        lastErrorCode: classification.lastErrorCode, lastErrorSummary: classification.lastErrorSummary,
        lastRequestLogId: params.requestLogId, publicMessage,
    });

    const previousStatus = previousRow?.status ?? null;
    const previousErrorCode = previousRow?.last_error_code ?? null;
    const notify = shouldNotifyTransition(previousStatus, previousErrorCode, status, classification.lastErrorCode);

    return { updated: true, notify, provider: providerNorm, status, publicMessage, requestLogId: params.requestLogId };
}

async function sendProviderAlertToAdmins(tenant: Tenant, result: ProviderEventResult): Promise<void> {
    const provider = result.provider ?? "unknown";
    const status = result.status ?? PROVIDER_STATUS.DESCONHECIDO;
    try {
        await notifyAdmins(tenant, {
            module: "erp",
            event: "provider_status_alert",
            title: `Atenção: ${labelProvider(provider)} ${labelStatusAlerta(status)}`,
            body: result.publicMessage || `${labelProvider(provider)} com instabilidade.`,
            url: "/painel",
            data: { requestLogId: result.requestLogId ?? null },
        });
    } catch (error) {
        logger.warn("EXT_API_PROVIDER_STATUS", "Falha ao notificar administradores", { provider, ...errorMeta(error) });
    }
}

/** Nunca propaga erro: uma falha ao atualizar o snapshot do provider não pode
 * derrubar o fluxo que já persistiu o log da requisição. */
async function registerProviderEventStandalone(tenant: Tenant, actor: ActorContext, params: {
    provider: string; requestLogId: string | null; statusCode: number | null; success: boolean;
    errorMessage?: string | null; errorClass?: string | null;
}): Promise<void> {
    try {
        const result = await withTenantTransaction(tenant, actor, (client) => registerProviderEvent(client, params));
        if (result.notify) await sendProviderAlertToAdmins(tenant, result);
    } catch (error) {
        logger.warn("EXT_API_PROVIDER_STATUS", "Falha ao atualizar snapshot do provider", {
            provider: params.provider, ...errorMeta(error),
        });
    }
}

export interface LogExternalApiRequestInput {
    provider: string; operation: string; method: string; endpoint: string; endpointPath?: string | null;
    statusCode: number | null; success: boolean; attemptCount?: number; waitMs?: number; durationMs?: number;
    requestPayload?: unknown; responseBody?: string | null; errorMessage?: string | null; errorClass?: string | null;
}

export async function logExternalApiRequest(tenant: Tenant, actor: ActorContext, input: LogExternalApiRequestInput): Promise<void> {
    const provider = normalizeProvider(input.provider) || "unknown";
    const method = String(input.method || "GET").trim().toUpperCase();
    const endpointPath = String(input.endpointPath || "").trim() || null;

    let requestLogId: string | null = null;
    try {
        requestLogId = await withTenantTransaction(tenant, actor, (client) =>
            insertExternalApiRequestLogRow(client, {
                provider, operation: String(input.operation || "request").trim(), method,
                endpoint: String(input.endpoint || "").trim(), endpointPath,
                statusCode: input.statusCode, success: Boolean(input.success),
                attemptCount: Math.max(1, Number(input.attemptCount || 1)),
                waitMs: Math.max(0, Number(input.waitMs || 0)),
                durationMs: Math.max(0, Number(input.durationMs || 0)),
                requestPayload: input.requestPayload ?? null,
                responseBody: truncateText(input.responseBody),
                errorMessage: truncateText(input.errorMessage, 450),
                errorClass: truncateText(input.errorClass, 120),
            }),
        );
    } catch (error) {
        logger.error("EXT_API_LOG", "Falha ao registrar request log", {
            provider, operation: input.operation, endpoint: endpointPath || input.endpoint, ...errorMeta(error),
        });
        return;
    }

    await registerProviderEventStandalone(tenant, actor, {
        provider, requestLogId, statusCode: input.statusCode, success: Boolean(input.success),
        errorMessage: input.errorMessage || input.responseBody, errorClass: input.errorClass,
    });
}

export async function listProviderStatuses(
    tenant: Tenant, actor: ActorContext, provider?: string,
): Promise<ExternalApiProviderStatusRow[]> {
    return withTenantTransaction(tenant, actor, (client) =>
        listProviderStatusRows(client, provider ? normalizeProvider(provider) : undefined),
    );
}

// Ponte entre o contrato genérico de transporte (ExternalApiCallReporter, sem
// tenant nem banco) e logExternalApiRequest (que precisa dos dois). É isto
// que um service com contexto de tenant passa para um client/provider de
// integração — ver docs/external-api-observability.md.
export function createExternalApiCallReporter(tenant: Tenant, actor: ActorContext, provider: string): ExternalApiCallReporter {
    return (report) =>
        logExternalApiRequest(tenant, actor, {
            provider,
            operation: report.operation,
            method: report.method,
            endpoint: report.endpoint,
            endpointPath: report.endpointPath,
            statusCode: report.statusCode,
            success: report.success,
            attemptCount: report.attemptCount,
            waitMs: report.waitMs,
            durationMs: report.durationMs,
            requestPayload: report.requestPayload,
            responseBody: report.responseBody,
            errorMessage: report.errorMessage,
            errorClass: report.errorClass,
        });
}
