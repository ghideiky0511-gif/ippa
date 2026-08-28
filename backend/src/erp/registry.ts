import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import type { ErpProvider, ErpProviderCredentials, ErpProviderFactory, ErpProviderTokenCache } from "./types";
import { createMockErpProvider } from "./providers/mock";
import { createTotvsModaErpProvider } from "./providers/totvsmoda";

// Fábrica pura (sem banco/tenant) — mapa código de provider -> implementação.
// Um provider real novo entra como providers/<nome>/ (mesmo formato do
// mock: index.ts + mapper.ts + cliente HTTP próprio) e ganha uma linha aqui.
const PROVIDER_FACTORIES: Record<string, ErpProviderFactory> = {
    mock: createMockErpProvider,
    totvsmoda: createTotvsModaErpProvider,
};

export function createErpProvider(
    providerCode: string,
    credentials: ErpProviderCredentials,
    reporter?: ExternalApiCallReporter,
    tokenCache?: ErpProviderTokenCache,
): ErpProvider {
    const factory = PROVIDER_FACTORIES[providerCode];
    if (!factory) throw new Error(`Unknown ERP provider: ${providerCode}`);
    return factory(credentials, reporter, tokenCache);
}

export function listSupportedErpProviders(): string[] {
    return Object.keys(PROVIDER_FACTORIES);
}
