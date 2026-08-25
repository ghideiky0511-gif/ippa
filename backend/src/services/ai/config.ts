import type { AiProviderProfile, AiProviderProfileKey } from "./types";

const DEFAULT_MODEL = "gpt-5.6-luna";

export function resolveAiProviderProfile(profile: AiProviderProfileKey): AiProviderProfile {
    if (profile !== "catalogOrderResume") throw new Error(`Perfil de IA desconhecido: ${profile}`);
    return {
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY_BIPPA_CATALOG_ORDER_RESUME?.trim() ?? "",
        model: process.env.OPENAI_MODEL_BIPPA_CATALOG_ORDER_RESUME?.trim()
            || process.env.OPENAI_MODEL?.trim()
            || DEFAULT_MODEL,
    };
}
