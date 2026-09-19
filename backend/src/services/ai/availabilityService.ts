import type { AiAvailability } from "@/contracts/ai";
import { isHomeAiConfigured } from "@/services/home/homeAiService";
import {
    isAiProviderProfileConfigured,
    isOpenAiApiKeyConfigured,
    resolveAiProviderProfile,
} from "./config";

const VALIDATION_CACHE_MS = 5 * 60_000;
const VALIDATION_TIMEOUT_MS = 5_000;

type CachedValidation = { available: boolean; expiresAt: number };
const credentialValidationCache = new Map<string, CachedValidation>();
const credentialValidationInFlight = new Map<string, Promise<boolean>>();

async function validateOpenAiCredential(cacheKey: string, apiKey: string): Promise<boolean> {
    if (!isOpenAiApiKeyConfigured(apiKey)) return false;

    const now = Date.now();
    const cached = credentialValidationCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.available;

    const inFlight = credentialValidationInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const validation = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
        try {
            // Uma leitura de metadados, sem prompt nem tokens, confirma se a
            // credencial é aceita antes de liberar o botão para o usuário.
            const response = await fetch("https://api.openai.com/v1/models?limit=1", {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: controller.signal,
            });
            const available = response.ok;
            credentialValidationCache.set(cacheKey, {
                available,
                expiresAt: Date.now() + VALIDATION_CACHE_MS,
            });
            return available;
        } catch {
            credentialValidationCache.set(cacheKey, {
                available: false,
                expiresAt: Date.now() + VALIDATION_CACHE_MS,
            });
            return false;
        } finally {
            clearTimeout(timeout);
            credentialValidationInFlight.delete(cacheKey);
        }
    })();
    credentialValidationInFlight.set(cacheKey, validation);
    return validation;
}

/**
 * Estado seguro para o browser: booleanos por capacidade, sem segredos e sem
 * fazer chamadas ao provider apenas para montar a interface.
 */
export async function getAiAvailability(): Promise<AiAvailability> {
    const catalogOrderResume = resolveAiProviderProfile("catalogOrderResume");
    const cartReviewInsight = resolveAiProviderProfile("cartReviewInsight");
    const homeApiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
    const [catalogOrderResumeAvailable, cartReviewInsightAvailable, homeGenerationAvailable] = await Promise.all([
        isAiProviderProfileConfigured("catalogOrderResume")
            ? validateOpenAiCredential("catalog_order_resume", catalogOrderResume.apiKey)
            : false,
        isAiProviderProfileConfigured("cartReviewInsight")
            ? validateOpenAiCredential("cart_review_insight", cartReviewInsight.apiKey)
            : false,
        isHomeAiConfigured()
            ? validateOpenAiCredential("home_generation", homeApiKey)
            : false,
    ]);

    return {
        features: {
            catalog_order_resume: catalogOrderResumeAvailable,
            cart_review_insight: cartReviewInsightAvailable,
            home_generation: homeGenerationAvailable,
        },
    };
}
