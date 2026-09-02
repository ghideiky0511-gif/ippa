import type { PoolClient } from "pg";
import { decryptPaymentCredentials, encryptPaymentCredentials } from "@/lib/crypto/paymentCredentials";

export interface PaymentIntegrationRow {
    id: string;
    provider: string;
    credentials: Record<string, unknown>;
    credentials_meta: Record<string, unknown>;
    active: boolean;
    webhook_secret: string | null;
    // Só preenchidos pra provider = "stripe" (Connect): stripe_account_id é
    // o acct_xxx da connected account do tenant, stripe_onboarding_status
    // reflete o último account.updated processado (ver
    // stripeWebhookService.ts). Colunas genéricas na linha compartilhada em
    // vez de tabela própria -- mesmo raciocínio de webhook_secret já
    // existir aqui sem ser usado por todo provider.
    stripe_account_id: string | null;
    stripe_onboarding_status: string | null;
    stripe_api_version: "v2" | null;
    // Só preenchidos pra provider = "mercadopago": mercadopago_user_id é o
    // id do vendedor devolvido pelo OAuth (só exibição/integridade, NÃO
    // participa da resolução de tenant do webhook -- ver
    // mercadoPagoWebhookService.ts); mercadopago_public_key não é segredo
    // (usado pelo frontend pra iniciar os Bricks). access_token/
    // refresh_token/expiresAt (esses sim segredo, diferente da Stripe) vão
    // dentro de `credentials` acima, cifrados como qualquer outro provider.
    mercadopago_user_id: string | null;
    mercadopago_public_key: string | null;
    created_at: Date;
    updated_at: Date;
}

interface PaymentIntegrationRawRow {
    id: string;
    provider: string;
    credentials_encrypted: Buffer;
    credentials_meta: Record<string, unknown>;
    active: boolean;
    webhook_secret: string | null;
    stripe_account_id: string | null;
    stripe_onboarding_status: string | null;
    stripe_api_version: "v2" | null;
    mercadopago_user_id: string | null;
    mercadopago_public_key: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface PaymentIntegrationWriteRow {
    provider: string;
    credentials: Record<string, unknown>;
    credentialsMeta: Record<string, unknown>;
}

const integrationFields =
    "id, provider, credentials_encrypted, credentials_meta, active, webhook_secret, stripe_account_id, stripe_onboarding_status, stripe_api_version, mercadopago_user_id, mercadopago_public_key, created_at, updated_at";

// Decifra na borda do model (nunca antes) -- quem chama já recebe
// `credentials` em claro, mas a linha nunca fica em claro fora deste
// arquivo (ver lib/crypto/paymentCredentials.ts).
function toRow(raw: PaymentIntegrationRawRow): PaymentIntegrationRow {
    return {
        id: raw.id,
        provider: raw.provider,
        credentials: decryptPaymentCredentials(raw.credentials_encrypted),
        credentials_meta: raw.credentials_meta,
        active: raw.active,
        webhook_secret: raw.webhook_secret,
        stripe_account_id: raw.stripe_account_id,
        stripe_onboarding_status: raw.stripe_onboarding_status,
        stripe_api_version: raw.stripe_api_version,
        mercadopago_user_id: raw.mercadopago_user_id,
        mercadopago_public_key: raw.mercadopago_public_key,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
    };
}

export async function findActivePaymentIntegrationRow(client: PoolClient): Promise<PaymentIntegrationRow | null> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `SELECT ${integrationFields} FROM tenant_payment_integrations WHERE tenant_id = app_tenant_id() AND active LIMIT 1`,
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function findPaymentIntegrationRowByProvider(
    client: PoolClient,
    provider: string,
): Promise<PaymentIntegrationRow | null> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `SELECT ${integrationFields} FROM tenant_payment_integrations WHERE tenant_id = app_tenant_id() AND provider = $1 LIMIT 1`,
        [provider],
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function listPaymentIntegrationRows(client: PoolClient): Promise<PaymentIntegrationRow[]> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `SELECT ${integrationFields} FROM tenant_payment_integrations WHERE tenant_id = app_tenant_id() ORDER BY provider`,
    );
    return result.rows.map(toRow);
}

// Salva/atualiza credenciais de um provider sem mexer em `active` -- mesmo
// raciocínio de upsertErpIntegrationCredentialsRow (uma linha estável por
// (tenant_id, provider), nunca acumula histórico).
export async function upsertPaymentIntegrationCredentialsRow(
    client: PoolClient,
    value: PaymentIntegrationWriteRow,
): Promise<PaymentIntegrationRow> {
    const encrypted = encryptPaymentCredentials(value.credentials);
    const result = await client.query<PaymentIntegrationRawRow>(
        `INSERT INTO tenant_payment_integrations (tenant_id, provider, credentials_encrypted, credentials_meta, active)
         VALUES (app_tenant_id(), $1, $2, $3, false)
         ON CONFLICT (tenant_id, provider)
         DO UPDATE SET credentials_encrypted = EXCLUDED.credentials_encrypted,
                       credentials_meta = EXCLUDED.credentials_meta,
                       updated_at = now()
         RETURNING ${integrationFields}`,
        [value.provider, encrypted, JSON.stringify(value.credentialsMeta)],
    );
    return toRow(result.rows[0]);
}

// Ativa a linha já existente de `provider` (precisa ter credenciais salvas
// antes) e desativa qualquer outra que estivesse ativa. Retorna null se o
// provider não tem credenciais salvas -- o service traduz isso em erro de
// validação.
export async function activatePaymentIntegrationRow(client: PoolClient, provider: string): Promise<PaymentIntegrationRow | null> {
    await client.query(
        "UPDATE tenant_payment_integrations SET active = false, updated_at = now() WHERE tenant_id = app_tenant_id() AND active AND provider <> $1",
        [provider],
    );
    const result = await client.query<PaymentIntegrationRawRow>(
        `UPDATE tenant_payment_integrations SET active = true, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND provider = $1
         RETURNING ${integrationFields}`,
        [provider],
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

// Desliga o gateway inteiro (nenhum provider ativo) sem apagar credenciais
// salvas. Idempotente: retorna null se já não havia nada ativo.
export async function deactivatePaymentIntegrationRow(client: PoolClient): Promise<PaymentIntegrationRow | null> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `UPDATE tenant_payment_integrations SET active = false, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND active
         RETURNING ${integrationFields}`,
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

// Desativa somente um provider. É usado quando uma connected account deixa de
// poder cobrar, sem desligar outro gateway que o tenant possa ter ativado
// depois da configuração da Stripe.
export async function deactivatePaymentIntegrationProviderRow(
    client: PoolClient,
    provider: string,
): Promise<PaymentIntegrationRow | null> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `UPDATE tenant_payment_integrations SET active = false, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND provider = $1 AND active
         RETURNING ${integrationFields}`,
        [provider],
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

// Desvincula uma connected account sem apagar a conta no Stripe. Esta ação é
// necessária quando a plataforma troca de conta/chave Stripe: uma connected
// account pertence à plataforma que a criou e não pode ser reutilizada pela
// nova plataforma.
export async function disconnectStripeAccountRow(client: PoolClient): Promise<PaymentIntegrationRow | null> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `UPDATE tenant_payment_integrations
         SET active = false,
             stripe_account_id = NULL,
             stripe_onboarding_status = NULL,
             stripe_api_version = NULL,
             updated_at = now()
         WHERE tenant_id = app_tenant_id()
           AND provider = 'stripe'
           AND stripe_account_id IS NOT NULL
         RETURNING ${integrationFields}`,
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

// Grava/atualiza o acct_xxx e o status de onboarding da connected account
// Stripe do tenant. `stripe_account_id = COALESCE(stripe_account_id, $1)`
// -- nunca reatribui a conta já setada (um segundo clique em "conectar" ou
// um webhook fora de ordem não pode trocar de conta por baixo do tenant).
export async function upsertStripeAccountRow(
    client: PoolClient,
    value: { stripeAccountId: string; onboardingStatus: string; apiVersion: "v2" },
): Promise<PaymentIntegrationRow | null> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `UPDATE tenant_payment_integrations
         SET stripe_account_id = COALESCE(stripe_account_id, $1),
             stripe_onboarding_status = $2,
             stripe_api_version = CASE WHEN stripe_account_id IS NULL THEN $3 ELSE stripe_api_version END,
             updated_at = now()
         WHERE tenant_id = app_tenant_id() AND provider = 'stripe'
         RETURNING ${integrationFields}`,
        [value.stripeAccountId, value.onboardingStatus, value.apiVersion],
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

// Desvincula uma conta Mercado Pago sem apagar o histórico de cobranças --
// espelha disconnectStripeAccountRow, mas sem checagem de versão de API
// (Mercado Pago não tem esse conceito). Guard
// `mercadopago_user_id IS NOT NULL` evita RETURNING vazio virar
// "desconectado com sucesso" quando nunca houve conta conectada.
export async function disconnectMercadoPagoAccountRow(client: PoolClient): Promise<PaymentIntegrationRow | null> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `UPDATE tenant_payment_integrations
         SET active = false, mercadopago_user_id = NULL, mercadopago_public_key = NULL, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND provider = 'mercadopago' AND mercadopago_user_id IS NOT NULL
         RETURNING ${integrationFields}`,
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

// Grava/atualiza o user_id e a public_key da conta Mercado Pago do tenant.
// Diferente de upsertStripeAccountRow, sem COALESCE "nunca reatribui": a
// troca de conta MP (reconexão explícita via novo onboarding) é um clique
// deliberado do admin, não uma corrida assíncrona -- sobrescrever é o
// comportamento certo (ver mercadoPagoOnboardingService.ts).
export async function upsertMercadoPagoAccountRow(
    client: PoolClient,
    value: { userId: string; publicKey: string },
): Promise<PaymentIntegrationRow | null> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `UPDATE tenant_payment_integrations
         SET mercadopago_user_id = $1, mercadopago_public_key = $2, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND provider = 'mercadopago'
         RETURNING ${integrationFields}`,
        [value.userId, value.publicKey],
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}
