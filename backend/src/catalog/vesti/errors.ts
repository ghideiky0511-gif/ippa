// Erro público do módulo de catálogo externo Vesti — espelha catalog_feed.py.

export interface VestiCatalogFeedErrorOptions {
    statusCode?: number;
    endpoint?: string;
}

// Erro funcional ao obter ou validar o catálogo externo da Vesti (porta de
// CatalogoExternoError, que no Python estende ValueError).
export class VestiCatalogFeedError extends Error {
    readonly statusCode?: number;
    readonly endpoint?: string;

    constructor(message: string, options: VestiCatalogFeedErrorOptions = {}) {
        super(message);
        this.name = "VestiCatalogFeedError";
        this.statusCode = options.statusCode;
        this.endpoint = options.endpoint;
    }
}
