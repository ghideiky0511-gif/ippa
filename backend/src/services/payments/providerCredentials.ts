import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { PaymentIntegrationRow } from "@/models/paymentIntegrationsModel";
import { upsertPaymentIntegrationCredentialsRow } from "@/models/paymentIntegrationsModel";
import { refreshMercadoPagoAccessToken } from "@/payments/providers/mercadopago/oauth";
import type { PaymentProviderCredentials } from "@/payments/types";

// Ponto único que monta `credentials` pra createPaymentProvider a partir de
// uma PaymentIntegrationRow -- reaproveitado por paymentChargeService.ts,
// paymentReconciliationService.ts e paymentIntegrationService.ts (evita
// repetir o branch stripe/mercadopago em 3+ lugares). É o único lugar do
// código que resolve credencial fazendo rede + escrita em banco (renovação
// de token Mercado Pago perto de expirar) -- por isso é async e vive na
// camada de serviço, não dentro de payments/providers/mercadopago/index.ts
// (que continua sem conhecer banco/tenant, ver payments/types.ts).

// Margem de segurança antes do vencimento do access_token -- renovar cedo
// demais desperdiça uma chamada de rede à toa; tarde demais arrisca uma
// cobrança falhar por token vencido no meio da operação. 1 dia cobre
// qualquer intervalo razoável entre reconciliações (5 min, ver
// paymentChargesModel.ts) sem risco de expirar entre a checagem e o uso.
const MERCADOPAGO_REFRESH_SAFETY_MARGIN_MS = 24 * 60 * 60_000;

export async function resolveProviderCredentials(
    tenant: Tenant,
    actor: ActorContext,
    integrationRow: PaymentIntegrationRow,
): Promise<PaymentProviderCredentials> {
    if (integrationRow.provider === "stripe") {
        return { stripeAccountId: integrationRow.stripe_account_id };
    }

    if (integrationRow.provider === "mercadopago") {
        const stored = integrationRow.credentials as {
            accessToken?: string;
            refreshToken?: string;
            expiresAt?: string;
        };
        const refreshToken = String(stored.refreshToken ?? "");
        const expiresAt = stored.expiresAt ? new Date(stored.expiresAt) : null;
        const needsRefresh = refreshToken && (!expiresAt || expiresAt.getTime() - Date.now() < MERCADOPAGO_REFRESH_SAFETY_MARGIN_MS);

        if (needsRefresh) {
            const refreshed = await refreshMercadoPagoAccessToken(refreshToken);
            await withTenantTransaction(tenant, actor, (client) =>
                upsertPaymentIntegrationCredentialsRow(client, {
                    provider: "mercadopago",
                    credentials: {
                        accessToken: refreshed.accessToken,
                        refreshToken: refreshed.refreshToken,
                        expiresAt: refreshed.expiresAt,
                    },
                    credentialsMeta: integrationRow.credentials_meta,
                }),
            );
            return { accessToken: refreshed.accessToken };
        }
        return { accessToken: String(stored.accessToken ?? "") };
    }

    throw new Error(`resolveProviderCredentials: provider desconhecido "${integrationRow.provider}".`);
}
