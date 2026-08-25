// Único transporte HTTP permitido para o feed público da Vesti — porta
// montar_url/buscar_xml de catalog_feed.py. Camada pura: não conhece tenant
// nem banco, só sabe montar a URL do feed e buscar o XML bruto. Reporta a
// chamada via ExternalApiCallReporter opcional (ver
// docs/external-api-observability.md) sem depender de tenant/banco.

import { logger } from "@/lib/logger";
import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import { VestiCatalogFeedError } from "./errors";

export const VESTI_CATALOG_DEFAULT_TIMEOUT_MS = 45_000;

export function montarVestiCatalogUrl(slug: string): string {
    return `https://vesti.co/${slug}/catalogo.xml`;
}

export interface BuscarVestiCatalogXmlOptions {
    timeoutMs?: number;
    reporter?: ExternalApiCallReporter;
}

export async function buscarVestiCatalogXml(url: string, options: BuscarVestiCatalogXmlOptions = {}): Promise<string> {
    const { timeoutMs = VESTI_CATALOG_DEFAULT_TIMEOUT_MS, reporter } = options;
    const startedAt = Date.now();

    async function report(entry: {
        statusCode: number | null; success: boolean; errorMessage?: string | null; errorClass?: string | null; responseBody?: string | null;
    }): Promise<void> {
        if (!reporter) return;
        try {
            await reporter({
                operation: "fetchCatalogFeed",
                method: "GET",
                endpoint: url,
                durationMs: Date.now() - startedAt,
                ...entry,
            });
        } catch (reportError) {
            logger.warn("vesti-catalog", "Falha ao reportar chamada externa para observabilidade", {
                endpoint: url, error: (reportError as Error).message,
            });
        }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
        response = await fetch(url, {
            headers: {
                "User-Agent": "BippaCatalogSync/1.0",
                Accept: "application/xml,text/xml,*/*",
            },
            signal: controller.signal,
        });
    } catch (exc) {
        const isTimeout = exc instanceof Error && exc.name === "AbortError";
        const errorClass = isTimeout ? "TimeoutError" : "ConnectionError";
        const message = isTimeout
            ? `Tempo limite excedido ao buscar o catálogo Vesti (${timeoutMs}ms).`
            : `Falha de rede ao buscar o catálogo Vesti: ${(exc as Error).message}`;
        logger.warn("vesti-catalog", "Falha de rede ao buscar o feed", { endpoint: url, error: (exc as Error).message });
        await report({ statusCode: null, success: false, errorMessage: message, errorClass });
        throw new VestiCatalogFeedError(message, { endpoint: url });
    } finally {
        clearTimeout(timer);
    }

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        logger.warn("vesti-catalog", "Feed retornou status de erro", {
            status: response.status,
            endpoint: url,
            body: body.slice(0, 500),
        });
        await report({
            statusCode: response.status, success: false,
            errorMessage: `Vesti retornou HTTP ${response.status} ao buscar o catálogo.`,
            errorClass: "VestiCatalogFeedError", responseBody: body,
        });
        throw new VestiCatalogFeedError(`Vesti retornou HTTP ${response.status} ao buscar o catálogo.`, {
            statusCode: response.status,
            endpoint: url,
        });
    }
    const xml = await response.text();
    await report({ statusCode: response.status, success: true });
    return xml;
}
