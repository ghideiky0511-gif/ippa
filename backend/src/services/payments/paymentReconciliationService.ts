import { withControlTransaction } from "@/lib/db/control";
import { findActiveTenantById, withTenantTransaction } from "@/lib/db/tenant";
import { createPaymentProvider } from "@/payments/registry";
import { scheduleNextPaymentChargeCheckRow } from "@/models/paymentChargesModel";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { applyPaymentChargeWebhookEvent } from "./paymentChargeService";
import { errorMeta, logger } from "@/lib/logger";

// Rede de segurança pra quando o webhook falha/atrasa (ver next_check_at em
// payment_charges e o comentário original em payments/types.ts). Mesmo
// desenho de dispatchCatalogSync (erp/catalogSyncService.ts): enumera
// trabalho pendente entre tenants via withControlTransaction (sem
// BYPASSRLS pra ippa_app), depois processa cada item dentro de uma
// transação do tenant certo.

const SYSTEM_ACTOR = { role: "system" };

interface DueChargeRow {
    tenant_id: string;
    charge_id: string;
    external_id: string | null;
    provider: string;
    stripe_account_id: string | null;
}

export async function dispatchPaymentReconciliation(
    input: { tenantId?: string } = {},
): Promise<{ checked: number; errors: Array<{ chargeId: string; error: string }> }> {
    const dueCharges = await withControlTransaction(async (client) => {
        const result = await client.query<DueChargeRow>(
            `SELECT pc.tenant_id, pc.id AS charge_id, pc.external_id, pc.provider, tpi.stripe_account_id
             FROM payment_charges pc
             JOIN tenant_payment_integrations tpi ON tpi.tenant_id = pc.tenant_id AND tpi.id = pc.integration_id
             WHERE pc.status IN ('pending', 'processing')
               AND pc.next_check_at IS NOT NULL AND pc.next_check_at <= now()
               AND ($1::uuid IS NULL OR pc.tenant_id = $1)
             ORDER BY pc.next_check_at
             LIMIT 100`,
            [input.tenantId ?? null],
        );
        return result.rows;
    });

    const errors: Array<{ chargeId: string; error: string }> = [];
    for (const due of dueCharges) {
        try {
            if (!due.external_id || !due.stripe_account_id || due.provider !== "stripe") continue;
            const tenant = await findActiveTenantById(due.tenant_id);
            if (!tenant) continue;
            const provider = createPaymentProvider(
                due.provider,
                { stripeAccountId: due.stripe_account_id },
                createExternalApiCallReporter(tenant, SYSTEM_ACTOR, due.provider),
            );
            const event = await provider.fetchChargeStatus(due.external_id);
            await withTenantTransaction(tenant, SYSTEM_ACTOR, async (client) => {
                await applyPaymentChargeWebhookEvent(client, due.provider, event);
                await scheduleNextPaymentChargeCheckRow(client, due.charge_id);
            });
        } catch (exc) {
            logger.error("payment-reconciliation", "Falha ao reconciliar cobrança", {
                tenantId: due.tenant_id,
                chargeId: due.charge_id,
                ...errorMeta(exc),
            });
            errors.push({ chargeId: due.charge_id, error: exc instanceof Error ? exc.message : String(exc) });
            // Ainda reagenda -- uma falha transitória de rede não pode travar
            // a cobrança fora da fila de reconciliação pra sempre.
            const tenant = await findActiveTenantById(due.tenant_id).catch(() => null);
            if (tenant) {
                await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
                    scheduleNextPaymentChargeCheckRow(client, due.charge_id),
                ).catch(() => undefined);
            }
        }
    }
    return { checked: dueCharges.length, errors };
}
