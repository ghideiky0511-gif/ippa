// Contrato de observabilidade para transportes HTTP externos (ERP, feeds de
// catálogo, etc.). Um transporte "puro" (ex.: erp/providers/*/http.ts,
// catalog/vesti/http.ts) não conhece tenant nem banco — só sabe fazer a
// requisição. Para reportar cada chamada sem quebrar essa pureza, ele recebe
// opcionalmente um ExternalApiCallReporter e o invoca ao final de cada
// requisição; quem tem contexto de tenant (o service que instancia o
// client/provider) fornece a implementação, normalmente via
// createExternalApiCallReporter de @/services/erp/externalApiLogService.
//
// Ver docs/external-api-observability.md para o guia completo de como ligar
// uma nova função de integração a essa observabilidade.

export interface ExternalApiCallReport {
    operation: string;
    method: string;
    endpoint: string;
    endpointPath?: string | null;
    statusCode: number | null;
    success: boolean;
    durationMs: number;
    attemptCount?: number;
    waitMs?: number;
    requestPayload?: unknown;
    responseBody?: string | null;
    errorMessage?: string | null;
    errorClass?: string | null;
}

export type ExternalApiCallReporter = (report: ExternalApiCallReport) => void | Promise<void>;
