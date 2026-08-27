import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import type { PaymentProvider, PaymentProviderCredentials, PaymentProviderFactory } from "./types";
import { createMockPaymentProvider } from "./providers/mock";

// Fábrica pura (sem banco/tenant) -- mapa código de provider -> implementação.
// Um provider real novo entra como providers/<nome>/ (mesmo formato do mock:
// index.ts + mapper.ts + cliente HTTP próprio) e ganha uma linha aqui. Ver
// backend/src/erp/registry.ts para o mesmo padrão aplicado a ERP.
const PROVIDER_FACTORIES: Record<string, PaymentProviderFactory> = {
    mock: createMockPaymentProvider,
};

export function createPaymentProvider(
    providerCode: string,
    credentials: PaymentProviderCredentials,
    reporter?: ExternalApiCallReporter,
): PaymentProvider {
    const factory = PROVIDER_FACTORIES[providerCode];
    if (!factory) throw new Error(`Unknown payment provider: ${providerCode}`);
    return factory(credentials, reporter);
}

export function listSupportedPaymentProviders(): string[] {
    return Object.keys(PROVIDER_FACTORIES);
}
