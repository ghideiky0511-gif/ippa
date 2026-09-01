import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { getStripeClient } from "@/payments/providers/stripe/client";
import { mapStripeAccountOnboardingStatus } from "@/payments/providers/stripe";
import {
    activatePaymentIntegrationRow,
    deactivatePaymentIntegrationProviderRow,
    disconnectStripeAccountRow,
    findPaymentIntegrationRowByProvider,
    upsertPaymentIntegrationCredentialsRow,
    upsertStripeAccountRow,
} from "@/models/paymentIntegrationsModel";
import {
    recordAuditEvent,
    PAYMENT_INTEGRATION_AUDIT_ACTIONS,
    type AuditRequestContext,
} from "@/services/audit";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { ValidationError } from "@/services/shared/errors";

// Onboarding de Stripe Connect (contas Express) não passa pelo formulário
// genérico de credenciais (ver providerCatalog.ts, onboardingType:
// "redirect") -- em vez de PUT credentials + POST activate, é: cria/reusa a
// connected account, gera um Account Link hospedado pela Stripe, o tenant
// completa o KYC lá. Ativação (`active = true`) NÃO acontece aqui -- só
// quando o webhook account.updated confirma charges_enabled/details_submitted
// (ver stripeWebhookService.ts).

export async function createStripeOnboardingLink(
    tenant: Tenant,
    user: AuthUser,
    returnUrl: string,
    context: AuditRequestContext,
): Promise<{ url: string }> {
    requireSettingsAdministrator(user);
    if (!returnUrl.trim()) throw new ValidationError("INVALID_INPUT", "returnUrl é obrigatório.");

    const client = getStripeClient();
    if (!client) throw new Error("Stripe não configurado (STRIPE_SECRET_KEY ausente).");

    const existing = await withTenantTransaction(tenant, user, (dbClient) =>
        findPaymentIntegrationRowByProvider(dbClient, "stripe"),
    );

    let stripeAccountId = existing?.stripe_account_id ?? undefined;
    if (!stripeAccountId) {
        // accounts.create é uma chamada de rede -- fica FORA da transação de
        // banco de propósito (mesmo raciocínio de createOrderCharge em
        // paymentChargeService.ts: nunca segurar conexão do pool durante
        // uma chamada à Stripe). Dois cliques concorrentes de "conectar"
        // sem conta ainda salva podem criar duas connected accounts na
        // Stripe -- upsertStripeAccountRow's COALESCE garante que só a
        // primeira grava no banco; a segunda fica órfã do lado da Stripe,
        // aceitável (ação manual de admin, sem dinheiro envolvido ainda).
        const account = await client.accounts.create({
            type: "express",
            // O checkout atual faz direct charges na connected account. Sem
            // pedir esta capability, a Stripe pode concluir o formulário mas
            // manter a conta incapaz de aceitar cartão.
            capabilities: { card_payments: { requested: true } },
            metadata: { tenant_id: tenant.id, tenant_slug: tenant.slug },
        });
        stripeAccountId = account.id;
        await withTenantTransaction(tenant, user, async (dbClient) => {
            await upsertPaymentIntegrationCredentialsRow(dbClient, {
                provider: "stripe",
                credentials: {},
                credentialsMeta: {},
            });
            await upsertStripeAccountRow(dbClient, {
                stripeAccountId: account.id,
                onboardingStatus: "pending",
            });
            await recordAuditEvent(dbClient, {
                action: PAYMENT_INTEGRATION_AUDIT_ACTIONS.CONFIGURED,
                entityId: existing?.id ?? account.id,
                actor: user,
                context,
                metadata: { provider: "stripe", stripeAccountId: account.id },
            });
        });
    }

    try {
        const accountLink = await client.accountLinks.create({
            account: stripeAccountId,
            type: "account_onboarding",
            return_url: returnUrl,
            refresh_url: returnUrl,
        });
        return { url: accountLink.url };
    } catch (error) {
        // Este caso acontece ao trocar STRIPE_SECRET_KEY por uma chave de
        // outra plataforma. O acct_ salvo ainda existe, mas pertence à
        // plataforma antiga e não pode receber Account Links desta nova.
        if (error instanceof Error && /account link for an account that is not connected to your platform/i.test(error.message)) {
            throw new ValidationError(
                "STRIPE_ACCOUNT_BELONGS_TO_ANOTHER_PLATFORM",
                "A conta Stripe vinculada pertence à plataforma anterior. Use \"Trocar conta Stripe\" para desvinculá-la desta loja e criar uma conta Connect na plataforma atual.",
            );
        }
        if (error instanceof Error && /only create new accounts if you've signed up for Connect/i.test(error.message)) {
            throw new ValidationError(
                "STRIPE_CONNECT_NOT_ENABLED",
                "A conta Stripe da plataforma ainda não está habilitada para o Stripe Connect. Abra https://dashboard.stripe.com/connect, conclua a adesão ao Connect no modo de teste e tente conectar a loja novamente.",
            );
        }
        if (error instanceof Error && /no longer recommends Accounts v1 for new Connect integrations/i.test(error.message)) {
            throw new ValidationError(
                "STRIPE_ACCOUNTS_V1_NOT_ENABLED",
                "Esta conta Stripe desativou a compatibilidade Accounts v1, usada pelo onboarding hospedado atual. Em modo de teste, abra https://dashboard.stripe.com/settings/features/feat_accounts_v1_support, habilite Accounts v1 support e tente conectar a loja novamente.",
            );
        }
        throw error;
    }
}

export async function disconnectStripeAccount(
    tenant: Tenant,
    user: AuthUser,
    context: AuditRequestContext,
): Promise<{ disconnected: boolean }> {
    requireSettingsAdministrator(user);
    return withTenantTransaction(tenant, user, async (dbClient) => {
        const row = await disconnectStripeAccountRow(dbClient);
        if (!row) return { disconnected: false };
        await recordAuditEvent(dbClient, {
            action: PAYMENT_INTEGRATION_AUDIT_ACTIONS.DEACTIVATED,
            entityId: row.id,
            actor: user,
            context,
            metadata: { provider: "stripe", disconnectedStripeAccount: true },
        });
        return { disconnected: true };
    });
}

export interface StripeOnboardingSyncResult {
    stripeAccountId: string;
    status: "pending" | "complete" | "restricted";
    active: boolean;
    requirements: {
        disabledReason: string | null;
        currentlyDue: string[];
        pastDue: string[];
    };
}

// O webhook é a fonte assíncrona normal. Esta sincronização dá feedback
// imediato na volta do Account Link e também revela requisitos pendentes em
// desenvolvimento, quando o endpoint de webhook ainda não está público.
export async function syncStripeOnboardingStatus(
    tenant: Tenant,
    user: AuthUser,
): Promise<StripeOnboardingSyncResult> {
    requireSettingsAdministrator(user);
    const client = getStripeClient();
    if (!client) throw new Error("Stripe não configurado (STRIPE_SECRET_KEY ausente).");

    const existing = await withTenantTransaction(tenant, user, (dbClient) =>
        findPaymentIntegrationRowByProvider(dbClient, "stripe"),
    );
    if (!existing?.stripe_account_id) {
        throw new ValidationError("STRIPE_ACCOUNT_NOT_CONNECTED", "Conecte uma conta Stripe antes de atualizar o status.");
    }

    const stripeAccountId = existing.stripe_account_id;
    let account = await client.accounts.retrieve(stripeAccountId);
    if (account.deleted) {
        throw new ValidationError("STRIPE_ACCOUNT_DELETED", "A conta conectada foi removida na Stripe.");
    }

    // Contas criadas antes de pedirmos card_payments explicitamente ainda
    // podem ser corrigidas sem recriar nem desvincular a conta do tenant.
    if (!account.capabilities?.card_payments) {
        account = await client.accounts.update(stripeAccountId, {
            capabilities: { card_payments: { requested: true } },
        });
    }

    const status = mapStripeAccountOnboardingStatus(account);
    const active = await withTenantTransaction(tenant, user, async (dbClient) => {
        const row = await upsertStripeAccountRow(dbClient, {
            stripeAccountId,
            onboardingStatus: status,
        });
        if (status === "complete" && row && !row.active) {
            await activatePaymentIntegrationRow(dbClient, "stripe");
            return true;
        }
        if (status !== "complete" && row?.active) {
            await deactivatePaymentIntegrationProviderRow(dbClient, "stripe");
            return false;
        }
        return row?.active ?? false;
    });

    return {
        stripeAccountId,
        status,
        active,
        requirements: {
            disabledReason: account.requirements?.disabled_reason ?? null,
            currentlyDue: account.requirements?.currently_due ?? [],
            pastDue: account.requirements?.past_due ?? [],
        },
    };
}
