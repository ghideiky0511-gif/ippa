// Porta de catalog_feed.py. Camada pura: recebe o slug já resolvido (quem
// chama decide de onde ele vem — hoje não há um equivalente TS a
// load_tenant_config) e devolve o catálogo externo normalizado.

import { montarVestiCatalogUrl, buscarVestiCatalogXml } from "./http";
import { parseVestiCatalogFeed, type VestiCatalogFeed } from "./mapper";

export { VestiCatalogFeedError, type VestiCatalogFeedErrorOptions } from "./errors";
export { montarVestiCatalogUrl, buscarVestiCatalogXml, VESTI_CATALOG_DEFAULT_TIMEOUT_MS } from "./http";
export { parseVestiCatalogFeed, type VestiCatalogFeed, type VestiExternalProduct, type VestiExternalVariant } from "./mapper";

export async function fetchVestiCatalogFeed(slug: string, options: { timeoutMs?: number } = {}): Promise<VestiCatalogFeed> {
    const url = montarVestiCatalogUrl(slug);
    const xml = await buscarVestiCatalogXml(url, options);
    return parseVestiCatalogFeed(xml);
}
