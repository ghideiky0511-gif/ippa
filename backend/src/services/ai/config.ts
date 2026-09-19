import type { AiProviderProfile, AiProviderProfileKey } from "./types";

const DEFAULT_MODEL = "gpt-5.6-luna";

/**
 * Validação propositalmente superficial: impede que um placeholder, valor
 * truncado ou variável vazia habilite a interface. A chave em si nunca sai
 * do processo e a autorização definitiva continua sendo do provider.
 */
export function isOpenAiApiKeyConfigured(value: string | undefined): boolean {
    return /^sk-[A-Za-z0-9_-]{20,}$/.test(value?.trim() ?? "");
}

export function resolveAiProviderProfile(profile: AiProviderProfileKey): AiProviderProfile {
    if (profile === "catalogOrderResume") {
        return {
            provider: "openai",
            apiKey: process.env.OPENAI_API_KEY_BIPPA_CATALOG_ORDER_RESUME?.trim() ?? "",
            model: process.env.OPENAI_MODEL_BIPPA_CATALOG_ORDER_RESUME?.trim()
                || process.env.OPENAI_MODEL?.trim()
                || DEFAULT_MODEL,
        };
    }
    if (profile === "cartReviewInsight") {
        return {
            provider: "openai",
            apiKey: process.env.OPENAI_API_KEY_BIPPA_CART_REVIEW_INSIGHT?.trim() ?? "",
            model: process.env.OPENAI_MODEL_BIPPA_CART_REVIEW_INSIGHT?.trim()
                || process.env.OPENAI_MODEL?.trim()
                || DEFAULT_MODEL,
        };
    }
    throw new Error(`Perfil de IA desconhecido: ${profile}`);
}

// A disponibilidade faz primeiro esta validação local e barata: a rota só
// informa se há uma credencial configurada, nunca lê nem devolve o
// valor dela. Erros transitórios do provider continuam sendo tratados quando
// uma ferramenta é efetivamente executada.
export function isAiProviderProfileConfigured(profile: AiProviderProfileKey): boolean {
    return isOpenAiApiKeyConfigured(resolveAiProviderProfile(profile).apiKey);
}
