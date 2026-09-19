"use client";

import { useEffect, useState } from "react";
import {
    AiAvailabilitySchema,
    type AiAvailability,
    type AiFeatureKey,
} from "@/contracts/ai";
import { apiFetch } from "@/lib/api-client";

type AvailabilityState = AiAvailability | null;

// Compartilhada entre todas as instâncias do hook montadas ao mesmo tempo
// (ex.: LastOrderAiAnalysis + CartReviewInsightCard na mesma página) — sem
// isso cada uma disparava seu próprio GET /api/ai/availability em paralelo.
let availabilityRequest: Promise<AvailabilityState> | null = null;

function fetchAvailability(): Promise<AvailabilityState> {
    if (!availabilityRequest) {
        availabilityRequest = apiFetch("/api/ai/availability", {
            cache: "no-store",
        })
            .then(async (response) => {
                if (!response.ok) return null;
                const parsed = AiAvailabilitySchema.safeParse(
                    await response.json().catch(() => null),
                );
                return parsed.success ? parsed.data : null;
            })
            .catch(() => null)
            .finally(() => {
                availabilityRequest = null;
            });
    }
    return availabilityRequest;
}

/**
 * Falha fechada: enquanto a disponibilidade é consultada — ou se a consulta
 * falhar — o componente de IA não é mostrado nem fica acionável.
 */
export function useAiAvailability(feature: AiFeatureKey): boolean {
    const [availability, setAvailability] = useState<AvailabilityState>(null);

    useEffect(() => {
        let active = true;

        fetchAvailability().then((value) => {
            if (active) setAvailability(value);
        });

        return () => {
            active = false;
        };
    }, []);

    return availability?.features[feature] === true;
}
