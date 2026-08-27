import { randomBytes } from "node:crypto";
import type { ChargeResult, PaymentProvider, WebhookEvent } from "../../types";

// Provider fake: não autentica nem chama nada externo, só simula respostas
// plausíveis para Pix/boleto/cartão -- serve para validar o contrato
// PaymentProvider ponta a ponta (registry, service de charge, webhook) antes
// de um provider real (iugu) existir. Mesmo papel que erp/providers/mock.
export function createMockPaymentProvider(): PaymentProvider {
    return {
        code: "mock",

        async createCharge(input): Promise<ChargeResult> {
            const externalId = `mock-charge-${randomBytes(6).toString("hex")}`;
            if (input.method === "pix") {
                return {
                    method: "pix",
                    externalId,
                    qrCode: "data:image/png;base64,mock",
                    copyPaste: `00020126mock${externalId}`,
                    expiresAt: new Date(Date.now() + 15 * 60_000),
                    raw: {},
                };
            }
            if (input.method === "boleto") {
                return {
                    method: "boleto",
                    externalId,
                    barcode: "00190.00009 01234.567890 12345.678901 1 23450000010000",
                    pdfUrl: `https://mock.invalid/boletos/${externalId}.pdf`,
                    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60_000),
                    raw: {},
                };
            }
            return {
                method: "cartao",
                externalId,
                status: input.cardToken ? "authorized" : "failed",
                lastDigits: input.cardToken ? "1111" : undefined,
                brand: input.cardToken ? "mock" : undefined,
                failureReason: input.cardToken ? undefined : "Token de cartão ausente.",
                raw: {},
            };
        },

        async fetchChargeStatus(externalId): Promise<WebhookEvent> {
            return { externalId, type: "mock.status_changed", status: "authorized", raw: {} };
        },

        parseWebhook(rawBody): WebhookEvent | null {
            try {
                const parsed = JSON.parse(rawBody) as { externalId?: string; status?: string };
                if (!parsed.externalId) return null;
                return {
                    externalId: parsed.externalId,
                    type: "mock.status_changed",
                    status: (parsed.status as WebhookEvent["status"]) ?? "authorized",
                    raw: parsed,
                };
            } catch {
                return null;
            }
        },

        async testConnection() {
            return { ok: true };
        },
    };
}
