import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import type Stripe from "stripe";
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

const V2_ACCOUNT_INCLUDES = ["configuration.merchant", "requirements"] as const;

function describeV2Requirements(account: Stripe.V2.Core.Account): StripeOnboardingSyncResult["requirements"] {
    const entries = account.requirements?.entries ?? [];
    const descriptionsFor = (status: "currently_due" | "past_due") =>
        entries
            .filter((entry) => entry.minimum_deadline?.status === status)
            .map((entry) => entry.description);
    const statusDetails = account.configuration?.merchant?.capabilities?.card_payments?.status_details ?? [];
    return {
        disabledReason: statusDetails.map((detail) => detail.code).join(", ") || null,
        currentlyDue: descriptionsFor("currently_due"),
        pastDue: descriptionsFor("past_due"),
    };
}

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

    if (existing?.stripe_account_id && existing.stripe_api_version !== "v2") {
        throw new ValidationError(
            "STRIPE_ACCOUNT_V1_RECONNECT_REQUIRED",
            "Esta loja possui uma conta Stripe vinculada pela API antiga. Use \"Trocar conta Stripe\" para reconectá-la exclusivamente pela Accounts v2.",
        );
    }

    let stripeAccountId = existing?.stripe_account_id ?? undefined;
    if (!stripeAccountId) {
        // Accounts v2.create é uma chamada de rede -- fica FORA da transação de
        // banco de propósito (mesmo raciocínio de createOrderCharge em
        // paymentChargeService.ts: nunca segurar conexão do pool durante
        // uma chamada à Stripe). Dois cliques concorrentes de "conectar"
        // sem conta ainda salva podem criar duas connected accounts na
        // Stripe -- upsertStripeAccountRow's COALESCE garante que só a
        // primeira grava no banco; a segunda fica órfã do lado da Stripe,
        // aceitável (ação manual de admin, sem dinheiro envolvido ainda).
        const account = await client.v2.core.accounts.create({
            contact_email: user.email,
            display_name: tenant.name,
            // `express` com a Stripe responsável pelos saldos negativos ainda
            // exige uma versão preview da API. O Dashboard completo é a
            // configuração estável compatível com as responsabilidades abaixo.
            dashboard: "full",
            // Obrigatório assim que qualquer configuration é pedida (erro
            // `identity_country_required`) -- plataforma opera só no Brasil
            // por ora, mesmo escopo de "apenas cartão" já decidido. O resto
            // da identidade (CPF/CNPJ, endereço etc.) é coletado no próprio
            // Account Link via collection_options abaixo.
            identity: { country: "BR" },
            // O checkout atual faz direct charges: merchant torna a connected
            // account a merchant of record e card_payments habilita cartão.
            configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
            defaults: {
                responsibilities: {
                    fees_collector: "stripe",
                    losses_collector: "stripe",
                },
            },
            metadata: { tenant_id: tenant.id, tenant_slug: tenant.slug },
            include: [...V2_ACCOUNT_INCLUDES],
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
                onboardingStatus: mapStripeAccountOnboardingStatus(account),
                apiVersion: "v2",
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
        const accountLink = await client.v2.core.accountLinks.create({
            account: stripeAccountId,
            use_case: {
                type: "account_onboarding",
                account_onboarding: {
                    configurations: ["merchant"],
                    collection_options: {
                        fields: "eventually_due",
                        future_requirements: "include",
                    },
                    return_url: returnUrl,
                    refresh_url: returnUrl,
                },
            },
        });
        return { url: accountLink.url };
    } catch (error) {
        if (error instanceof Error && /accounts_v2_access_blocked/i.test(error.message)) {
            throw new ValidationError(
                "STRIPE_ACCOUNTS_V2_NOT_ENABLED",
                "Accounts v2 ainda não está habilitada para esta plataforma Stripe. Habilite Accounts v2 no Dashboard da Stripe e tente novamente.",
            );
        }
        if (error instanceof Error && /only create new accounts if you've signed up for Connect/i.test(error.message)) {
            throw new ValidationError(
                "STRIPE_CONNECT_NOT_ENABLED",
                "A conta Stripe da plataforma ainda não está habilitada para o Stripe Connect. Abra https://dashboard.stripe.com/connect, conclua a adesão ao Connect no modo de teste e tente conectar a loja novamente.",
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
    if (existing.stripe_api_version !== "v2") {
        throw new ValidationError(
            "STRIPE_ACCOUNT_V1_RECONNECT_REQUIRED",
            "Esta loja possui uma conta Stripe vinculada pela API antiga. Use \"Trocar conta Stripe\" para reconectá-la exclusivamente pela Accounts v2.",
        );
    }

    const stripeAccountId = existing.stripe_account_id;
    const account = await client.v2.core.accounts.retrieve(stripeAccountId, {
        include: [...V2_ACCOUNT_INCLUDES],
    });
    if (account.closed) {
        throw new ValidationError("STRIPE_ACCOUNT_DELETED", "A conta conectada foi removida na Stripe.");
    }

    const status = mapStripeAccountOnboardingStatus(account);
    const active = await withTenantTransaction(tenant, user, async (dbClient) => {
        const row = await upsertStripeAccountRow(dbClient, {
            stripeAccountId,
            onboardingStatus: status,
            apiVersion: "v2",
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
        requirements: describeV2Requirements(account),
    };
}
