import type { FreightProviderRow } from "@/models/freightProvidersModel";
import { ValidationError } from "@/services/shared/errors";

export interface FreightPrice { label: string; price: number; etaLabel: string | null }

// Preço/label/prazo derivados da config de um freight_provider ativo --
// reaproveitado tanto pra gerar as cotações de uma sessão (orderSessionService
// .listFreightQuotes) quanto pro checkout direto sem sessão
// (orderService.createCustomerOrder), pra não duplicar essa regra em dois
// lugares. `kind = 'carrier'` ainda não tem provider real integrado (ver
// migration 043), então nenhum provider ativo hoje tem esse kind -- se um dia
// tiver, cai aqui e precisa de uma implementação de cotação de verdade.
export function computeFreightPrice(provider: FreightProviderRow): FreightPrice {
    if (provider.kind === "pickup") {
        return { label: provider.name, price: 0, etaLabel: null };
    }
    if (provider.kind === "fixed") {
        const configuration = provider.configuration as { price?: number; etaLabel?: string };
        return {
            label: provider.name,
            price: typeof configuration.price === "number" ? configuration.price : 0,
            etaLabel: configuration.etaLabel ?? null,
        };
    }
    throw new ValidationError("FREIGHT_PROVIDER_KIND_NOT_SUPPORTED", `Provider de frete "${provider.code}" ainda não tem cotação automática.`);
}
