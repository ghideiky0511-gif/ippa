import type { PoolClient } from "pg";
import { decryptWhatsAppAccessToken, encryptWhatsAppAccessToken } from "@/lib/crypto/whatsappCredentials";

export type WhatsAppIntegrationStatus = "pending" | "connected" | "error" | "disconnected";

export interface WhatsAppIntegrationCredentialsMeta {
    /** true quando os templates order_confirmed/payment_link estão APPROVED na Meta. */
    templatesApproved?: boolean;
}

export interface SellerWhatsAppIntegrationRow {
    id: string;
    seller_id: string;
    waba_id: string | null;
    phone_number_id: string | null;
    display_phone_number: string | null;
    /** null enquanto status = 'pending' (onboarding ainda não completou). */
    access_token: string | null;
    credentials_meta: WhatsAppIntegrationCredentialsMeta;
    status: WhatsAppIntegrationStatus;
    active: boolean;
    last_error: string | null;
    created_at: Date;
    updated_at: Date;
}

interface RawRow {
    id: string;
    seller_id: string;
    waba_id: string | null;
    phone_number_id: string | null;
    display_phone_number: string | null;
    access_token_encrypted: Buffer | null;
    credentials_meta: WhatsAppIntegrationCredentialsMeta;
    status: WhatsAppIntegrationStatus;
    active: boolean;
    last_error: string | null;
    created_at: Date;
    updated_at: Date;
}

const fields =
    "id, seller_id, waba_id, phone_number_id, display_phone_number, access_token_encrypted, credentials_meta, status, active, last_error, created_at, updated_at";

function toRow(raw: RawRow): SellerWhatsAppIntegrationRow {
    return {
        id: raw.id,
        seller_id: raw.seller_id,
        waba_id: raw.waba_id,
        phone_number_id: raw.phone_number_id,
        display_phone_number: raw.display_phone_number,
        access_token: raw.access_token_encrypted ? decryptWhatsAppAccessToken(raw.access_token_encrypted) : null,
        credentials_meta: raw.credentials_meta,
        status: raw.status,
        active: raw.active,
        last_error: raw.last_error,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
    };
}

export async function findWhatsAppIntegrationRowBySellerId(
    client: PoolClient,
    sellerId: string,
): Promise<SellerWhatsAppIntegrationRow | null> {
    const result = await client.query<RawRow>(
        `SELECT ${fields} FROM seller_whatsapp_integrations WHERE tenant_id = app_tenant_id() AND seller_id = $1`,
        [sellerId],
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

// Usado no envio -- só considera uma integração utilizável quando `active`
// e com templates aprovados (ver whatsappNotificationService). Sem token
// (status ainda 'pending') nunca casa aqui porque access_token_encrypted é
// obrigatório para o onboarding marcar `active`.
export async function findActiveWhatsAppIntegrationRowBySellerId(
    client: PoolClient,
    sellerId: string,
): Promise<SellerWhatsAppIntegrationRow | null> {
    const result = await client.query<RawRow>(
        `SELECT ${fields} FROM seller_whatsapp_integrations
         WHERE tenant_id = app_tenant_id() AND seller_id = $1 AND active AND access_token_encrypted IS NOT NULL`,
        [sellerId],
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

// Visão administrativa: todas as vendedoras do tenant, com status de
// conexão de quem já iniciou o onboarding (ou "não conectado" para quem
// nunca iniciou -- por isso é LEFT JOIN, sem decifrar token nenhum, essa
// visão nunca precisa do valor em claro).
export interface WhatsAppIntegrationListEntry {
    sellerId: string;
    sellerName: string;
    sellerEmail: string;
    status: WhatsAppIntegrationStatus | "not_connected";
    active: boolean;
    displayPhoneNumber: string | null;
    lastError: string | null;
    updatedAt: Date | null;
}

interface ListRow {
    seller_id: string;
    seller_name: string;
    seller_email: string;
    status: WhatsAppIntegrationStatus | null;
    active: boolean | null;
    display_phone_number: string | null;
    last_error: string | null;
    updated_at: Date | null;
}

export async function listWhatsAppIntegrationsForTenant(client: PoolClient): Promise<WhatsAppIntegrationListEntry[]> {
    const result = await client.query<ListRow>(
        `SELECT u.id AS seller_id, u.name AS seller_name, u.email AS seller_email,
                i.status, i.active, i.display_phone_number, i.last_error, i.updated_at
         FROM users u
         LEFT JOIN seller_whatsapp_integrations i ON i.tenant_id = app_tenant_id() AND i.seller_id = u.id
         WHERE u.tenant_id = app_tenant_id() AND u.role = 'vendedora'
         ORDER BY u.name`,
    );
    return result.rows.map((row) => ({
        sellerId: row.seller_id,
        sellerName: row.seller_name,
        sellerEmail: row.seller_email,
        status: row.status ?? "not_connected",
        active: row.active ?? false,
        displayPhoneNumber: row.display_phone_number,
        lastError: row.last_error,
        updatedAt: row.updated_at,
    }));
}

// Começa (ou reinicia) o onboarding de uma vendedora: cria a linha em
// 'pending' se não existir, ou zera uma linha existente (reconexão após
// erro/desconexão) -- uma vendedora nunca acumula mais de uma linha (ver
// UNIQUE (tenant_id, seller_id) na migration 056).
export async function upsertPendingWhatsAppIntegrationRow(
    client: PoolClient,
    sellerId: string,
): Promise<SellerWhatsAppIntegrationRow> {
    const result = await client.query<RawRow>(
        `INSERT INTO seller_whatsapp_integrations (tenant_id, seller_id, status, active)
         VALUES (app_tenant_id(), $1, 'pending', false)
         ON CONFLICT (tenant_id, seller_id)
         DO UPDATE SET status = 'pending', last_error = NULL, updated_at = now()
         RETURNING ${fields}`,
        [sellerId],
    );
    return toRow(result.rows[0]);
}

export interface CompleteWhatsAppOnboardingInput {
    sellerId: string;
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    accessToken: string;
    credentialsMeta: WhatsAppIntegrationCredentialsMeta;
}

// Onboarding bem-sucedido conecta e já ativa -- diferente de
// tenant_payment_integrations/tenant_erp_integrations (credenciais digitadas
// à mão, "salvar" e "ativar" são passos distintos porque o texto pode estar
// errado), aqui a prova de que a conexão funciona É o Embedded Signup ter
// terminado (a Meta já validou do lado dela). activate/deactivate continuam
// existindo para a vendedora pausar/retomar sem precisar reconectar.
export async function completeWhatsAppOnboardingRow(
    client: PoolClient,
    input: CompleteWhatsAppOnboardingInput,
): Promise<SellerWhatsAppIntegrationRow> {
    const encrypted = encryptWhatsAppAccessToken(input.accessToken);
    const result = await client.query<RawRow>(
        `UPDATE seller_whatsapp_integrations
         SET waba_id = $2, phone_number_id = $3, display_phone_number = $4,
             access_token_encrypted = $5, credentials_meta = $6,
             status = 'connected', active = true, last_error = NULL, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND seller_id = $1
         RETURNING ${fields}`,
        [input.sellerId, input.wabaId, input.phoneNumberId, input.displayPhoneNumber, encrypted, JSON.stringify(input.credentialsMeta)],
    );
    if (!result.rows[0]) throw new Error("seller_whatsapp_integrations: linha 'pending' não encontrada ao completar onboarding.");
    return toRow(result.rows[0]);
}

export async function activateWhatsAppIntegrationRow(
    client: PoolClient,
    sellerId: string,
): Promise<SellerWhatsAppIntegrationRow | null> {
    const result = await client.query<RawRow>(
        `UPDATE seller_whatsapp_integrations SET active = true, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND seller_id = $1 AND status = 'connected'
         RETURNING ${fields}`,
        [sellerId],
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function deactivateWhatsAppIntegrationRow(
    client: PoolClient,
    sellerId: string,
): Promise<SellerWhatsAppIntegrationRow | null> {
    const result = await client.query<RawRow>(
        `UPDATE seller_whatsapp_integrations SET active = false, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND seller_id = $1 AND active
         RETURNING ${fields}`,
        [sellerId],
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function markWhatsAppIntegrationErrorRow(
    client: PoolClient,
    sellerId: string,
    lastError: string,
): Promise<void> {
    await client.query(
        `UPDATE seller_whatsapp_integrations SET status = 'error', active = false, last_error = $2, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND seller_id = $1`,
        [sellerId, lastError],
    );
}

export async function updateWhatsAppIntegrationCredentialsMetaRow(
    client: PoolClient,
    sellerId: string,
    credentialsMeta: WhatsAppIntegrationCredentialsMeta,
): Promise<void> {
    await client.query(
        `UPDATE seller_whatsapp_integrations SET credentials_meta = $2, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND seller_id = $1`,
        [sellerId, JSON.stringify(credentialsMeta)],
    );
}
