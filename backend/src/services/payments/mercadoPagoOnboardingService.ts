import { createHmac, timingSafeEqual } from "node:crypto";
import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { findActiveTenantById, withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import {
    getMercadoPagoClientId,
    getMercadoPagoOAuthStateSecret,
    getMercadoPagoRedirectUri,
} from "@/payments/providers/mercadopago/client";
import { exchangeMercadoPagoAuthorizationCode } from "@/payments/providers/mercadopago/oauth";
import {
    activatePaymentIntegrationRow,
    disconnectMercadoPagoAccountRow,
    upsertMercadoPagoAccountRow,
    upsertPaymentIntegrationCredentialsRow,
} from "@/models/paymentIntegrationsModel";
import { recordAuditEvent, PAYMENT_INTEGRATION_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { ValidationError } from "@/services/shared/errors";

// Onboarding de Mercado Pago (Split Payments/marketplace via OAuth) --
// mesmo espírito de stripeOnboardingService.ts, mas mais simples num ponto
// central: a troca do `code` OAuth (POST /oauth/token) JÁ é a confirmação
// de onboarding completo, não existe um KYC assíncrono separado pra
// esperar (comparar com stripeOnboardingService.ts, onde ativação só
// acontece quando um webhook confirma charges_enabled). Por isso a
// ativação aqui é síncrona, dentro do próprio callback.
//
// Diferença estrutural do Stripe: o redirect_uri do Mercado Pago é
// obrigatoriamente uma URL estática cadastrada no painel do app (não pode
// ter o slug do tenant nela, ver backend/src/app/api/webhooks/mercadopago/
// oauth-callback/route.ts) -- o `state` assinado abaixo é o único jeito de
// recuperar QUAL tenant iniciou o fluxo quando o navegador volta pro
// backend nesse segundo salto.

const SYSTEM_ACTOR: ActorContext = { role: "system" };
const STATE_TTL_MS = 15 * 60_000;

interface OAuthStatePayload {
    tenantId: string;
    returnUrl: string;
    iat: number;
}

function signState(payload: OAuthStatePayload): string {
    const secret = getMercadoPagoOAuthStateSecret();
    if (!secret) throw new Error("Mercado Pago não configurado (MERCADOPAGO_OAUTH_STATE_SECRET ausente).");
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
}

// Verifica assinatura + TTL ANTES de confiar em qualquer campo do state --
// mesma ordem "assinatura primeiro" usada em processStripeWebhook.
function verifyState(state: string): OAuthStatePayload {
    const secret = getMercadoPagoOAuthStateSecret();
    if (!secret) throw new Error("Mercado Pago não configurado (MERCADOPAGO_OAUTH_STATE_SECRET ausente).");
    const [encoded, signature] = state.split(".");
    if (!encoded || !signature) {
        throw new ValidationError("INVALID_OAUTH_STATE", "Link de conexão inválido ou expirado. Tente conectar novamente.");
    }
    const expectedSignature = createHmac("sha256", secret).update(encoded).digest("base64url");
    const expected = Buffer.from(expectedSignature);
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        throw new ValidationError("INVALID_OAUTH_STATE", "Link de conexão inválido ou expirado. Tente conectar novamente.");
    }
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthStatePayload;
    if (!payload.tenantId || !payload.returnUrl || typeof payload.iat !== "number") {
        throw new ValidationError("INVALID_OAUTH_STATE", "Link de conexão inválido ou expirado. Tente conectar novamente.");
    }
    if (Date.now() - payload.iat > STATE_TTL_MS) {
        throw new ValidationError("INVALID_OAUTH_STATE", "Link de conexão expirado. Tente conectar novamente.");
    }
    return payload;
}

export async function createMercadoPagoOnboardingLink(
    tenant: Tenant,
    user: AuthUser,
    returnUrl: string,
    context: AuditRequestContext,
): Promise<{ url: string }> {
    requireSettingsAdministrator(user);
    if (!returnUrl.trim()) throw new ValidationError("INVALID_INPUT", "returnUrl é obrigatório.");

    const clientId = getMercadoPagoClientId();
    const redirectUri = getMercadoPagoRedirectUri();
    if (!clientId || !redirectUri) {
        throw new Error("Mercado Pago não configurado (MERCADOPAGO_CLIENT_ID/MERCADOPAGO_REDIRECT_URI ausentes).");
    }

    const state = signState({ tenantId: tenant.id, returnUrl, iat: Date.now() });
    // Host e query params confirmados contra a documentação oficial
    // (developers.mercadopago.com.br > security/oauth/creation) em teste real
    // nesta sessão: .com.br devolvia 400 "não foi possível conectar o
    // aplicativo à sua conta" -- o host correto é .com (sem "br"), mesmo pra
    // contas brasileiras. platform_id=mp confirmado como exemplo oficial.
    const url = new URL("https://auth.mercadopago.com/authorization");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);

    await withTenantTransaction(tenant, user, (client) =>
        recordAuditEvent(client, {
            action: PAYMENT_INTEGRATION_AUDIT_ACTIONS.CONFIGURED,
            entityId: tenant.id,
            actor: user,
            context,
            metadata: { provider: "mercadopago", step: "onboarding_link_created" },
        }),
    );

    return { url: url.toString() };
}

// Chamado pela rota pública de callback (sem sessão, sem tenant na URL --
// ver backend/src/app/api/webhooks/mercadopago/oauth-callback/route.ts).
// Sem AuthUser real disponível neste ponto (não é uma ação de admin
// logado, é o Mercado Pago redirecionando o navegador de volta) -- por
// isso usa SYSTEM_ACTOR pra transação de tenant e NÃO grava audit event
// aqui, mesmo padrão de stripeWebhookService.ts::applyV2AccountState
// (ativação disparada por um fluxo automático não tem "quem" atribuir).
export async function handleMercadoPagoOAuthCallback(code: string, state: string): Promise<{ redirectTo: string }> {
    const { tenantId, returnUrl } = verifyState(state);
    const tenant = await findActiveTenantById(tenantId);
    if (!tenant) throw new ValidationError("TENANT_NOT_FOUND", "Loja não encontrada.");

    const tokens = await exchangeMercadoPagoAuthorizationCode(code);

    await withTenantTransaction(tenant, SYSTEM_ACTOR, async (client) => {
        // upsertPaymentIntegrationCredentialsRow cria a linha se ainda não
        // existir (INSERT ... ON CONFLICT) -- garante que
        // upsertMercadoPagoAccountRow/activatePaymentIntegrationRow (só
        // UPDATE) sempre encontrem uma linha, sem precisar de um passo de
        // pré-criação em createMercadoPagoOnboardingLink.
        await upsertPaymentIntegrationCredentialsRow(client, {
            provider: "mercadopago",
            credentials: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: tokens.expiresAt,
            },
            credentialsMeta: {},
        });
        await upsertMercadoPagoAccountRow(client, { userId: tokens.userId, publicKey: tokens.publicKey });
        await activatePaymentIntegrationRow(client, "mercadopago");
    });

    return { redirectTo: returnUrl };
}

// Desconecta a conta Mercado Pago do tenant sem apagar o histórico de
// cobranças -- mais simples que disconnectStripeAccount (sem checagem de
// versão de API pra replicar).
export async function disconnectMercadoPagoAccount(
    tenant: Tenant,
    user: AuthUser,
    context: AuditRequestContext,
): Promise<{ disconnected: boolean }> {
    requireSettingsAdministrator(user);
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await disconnectMercadoPagoAccountRow(client);
        if (!row) return { disconnected: false };
        await recordAuditEvent(client, {
            action: PAYMENT_INTEGRATION_AUDIT_ACTIONS.DEACTIVATED,
            entityId: row.id,
            actor: user,
            context,
            metadata: { provider: "mercadopago", disconnectedMercadoPagoAccount: true },
        });
        return { disconnected: true };
    });
}
