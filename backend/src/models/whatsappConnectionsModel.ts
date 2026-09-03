import type { PoolClient } from "pg";

// CRUD sobre whatsapp_connections (migration 063) -- substitui
// sellerWhatsappIntegrationsModel.ts. Uma linha por VENDEDORA (não por
// tenant), sem nenhuma credencial da Meta: só o estado local de referência
// necessário para saber "esta vendedora já conectou um telefone? qual?" --
// ver services/whatsapp/{whatsappIntegrationService,
// whatsappOnboardingService,whatsappNotificationService}.ts.

export interface WhatsAppConnectionRow {
    id: string;
    tenant_id: string;
    seller_id: string;
    phone_id: string | null;
    external_reference: string;
    sender_profile_key: string;
    capability_payments: boolean;
    display_phone_masked: string | null;
    verified_name: string | null;
    quality_rating: string | null;
    status: string;
    last_synced_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

const fields =
    "id, tenant_id, seller_id, phone_id, external_reference, sender_profile_key, capability_payments, display_phone_masked, verified_name, quality_rating, status, last_synced_at, created_at, updated_at";

export async function findWhatsAppConnectionBySeller(client: PoolClient, sellerId: string): Promise<WhatsAppConnectionRow | null> {
    const result = await client.query<WhatsAppConnectionRow>(
        `SELECT ${fields} FROM whatsapp_connections WHERE tenant_id = app_tenant_id() AND seller_id = $1`,
        [sellerId],
    );
    return result.rows[0] ?? null;
}

// Todas as conexões (conectadas ou não) das vendedoras deste tenant -- usada
// pela tela de Integrações para mostrar o status de cada vendedora numa
// lista só.
export async function listWhatsAppConnectionsByTenant(client: PoolClient): Promise<WhatsAppConnectionRow[]> {
    const result = await client.query<WhatsAppConnectionRow>(
        `SELECT ${fields} FROM whatsapp_connections WHERE tenant_id = app_tenant_id() ORDER BY created_at`,
    );
    return result.rows;
}

export interface UpsertWhatsAppConnectionInput {
    tenantId: string;
    sellerId: string;
    externalReference: string;
    senderProfileKey: string;
}

// Cria (ou reafirma) a linha de referência da vendedora antes de um telefone
// ter sido associado -- chamado ao iniciar/reiniciar o onboarding. Nunca
// mexe em phone_id/status de uma associação já existente (ON CONFLICT só
// atualiza sender_profile_key/updated_at) -- reiniciar o onboarding não deve
// apagar uma conexão já confirmada.
export async function upsertWhatsAppConnectionRow(
    client: PoolClient,
    input: UpsertWhatsAppConnectionInput,
): Promise<WhatsAppConnectionRow> {
    const result = await client.query<WhatsAppConnectionRow>(
        `INSERT INTO whatsapp_connections (tenant_id, seller_id, external_reference, sender_profile_key, status)
         VALUES (app_tenant_id(), $1, $2, $3, 'not_connected')
         ON CONFLICT (seller_id)
         DO UPDATE SET sender_profile_key = $3, updated_at = now()
         RETURNING ${fields}`,
        [input.sellerId, input.externalReference, input.senderProfileKey],
    );
    return result.rows[0];
}

export interface UpdateWhatsAppConnectionAfterAssociationInput {
    externalReference: string;
    phoneId: string;
    senderProfileKey: string;
    capabilityPayments: boolean;
    displayPhoneMasked: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    status: string;
}

// Confirma a associação telefone <-> sender profile depois que o
// bippa-messaging aceitou o PATCH /phones/:phoneId/sender-profile -- é só
// aqui que a UI pode mostrar "conectado" (nunca otimista, ver decisão no
// plano de integração). INSERT ... ON CONFLICT (não um UPDATE puro) de
// propósito: recria a linha da vendedora se por algum motivo ela não existir
// ainda (onboarding nunca chamado antes, ou linha perdida), mesma robustez
// do desenho anterior.
export async function updateWhatsAppConnectionAfterAssociation(
    client: PoolClient,
    sellerId: string,
    input: UpdateWhatsAppConnectionAfterAssociationInput,
): Promise<WhatsAppConnectionRow> {
    const result = await client.query<WhatsAppConnectionRow>(
        `INSERT INTO whatsapp_connections
            (tenant_id, seller_id, phone_id, external_reference, sender_profile_key, capability_payments,
             display_phone_masked, verified_name, quality_rating, status, last_synced_at)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         ON CONFLICT (seller_id) DO UPDATE SET
            phone_id = $2,
            external_reference = $3,
            sender_profile_key = $4,
            capability_payments = $5,
            display_phone_masked = $6,
            verified_name = $7,
            quality_rating = $8,
            status = $9,
            last_synced_at = now(),
            updated_at = now()
         RETURNING ${fields}`,
        [
            sellerId,
            input.phoneId,
            input.externalReference,
            input.senderProfileKey,
            input.capabilityPayments,
            input.displayPhoneMasked,
            input.verifiedName,
            input.qualityRating,
            input.status,
        ],
    );
    return result.rows[0];
}

// Desconecta localmente (mantém a linha para o histórico de
// sender_profile_key, só limpa o vínculo de telefone) -- usado se/quando
// existir um fluxo de desconexão explícito na UI.
export async function clearWhatsAppConnectionRow(client: PoolClient, sellerId: string): Promise<void> {
    await client.query(
        `UPDATE whatsapp_connections
         SET phone_id = NULL, status = 'not_connected', updated_at = now()
         WHERE tenant_id = app_tenant_id() AND seller_id = $1`,
        [sellerId],
    );
}
