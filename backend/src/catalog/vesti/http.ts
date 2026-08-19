// Único transporte HTTP permitido para o feed público da Vesti — porta
// montar_url/buscar_xml de catalog_feed.py. Camada pura: não conhece tenant
// nem banco, só sabe montar a URL do feed e buscar o XML bruto.

import { logger } from "@/lib/logger";
import { VestiCatalogFeedError } from "./errors";

export const VESTI_CATALOG_DEFAULT_TIMEOUT_MS = 45_000;

export function montarVestiCatalogUrl(slug: string): string {
    return `https://vesti.co/${slug}/catalogo.xml`;
}

export async function buscarVestiCatalogXml(url: string, options: { timeoutMs?: number } = {}): Promise<string> {
    const { timeoutMs = VESTI_CATALOG_DEFAULT_TIMEOUT_MS } = options;

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
        logger.warn("vesti-catalog", "Falha de rede ao buscar o feed", { endpoint: url, error: (exc as Error).message });
        throw new VestiCatalogFeedError(`Falha de rede ao buscar o catálogo Vesti: ${(exc as Error).message}`, {
            endpoint: url,
        });
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
        throw new VestiCatalogFeedError(`Vesti retornou HTTP ${response.status} ao buscar o catálogo.`, {
            statusCode: response.status,
            endpoint: url,
        });
    }
    return response.text();
}
