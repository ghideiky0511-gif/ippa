import type { PoolClient } from "pg";

// CRUD sobre whatsapp_onboarding_attempts (migration 065) -- registro local
// durável de cada tentativa de Embedded Signup aberta no bippa-messaging.
// NUNCA guarda `state` (token de uso único do popup) -- ver
// services/whatsapp/whatsappOnboardingService.ts, que é quem chama este
// model e é responsável por não vazar `state` nem para o log.

export interface WhatsAppOnboardingAttemptResult {
    connection: {
        id: string;
        waba_id: string;
        status: string;
        expires_at: string | null;
        owner_business_id: string;
        granted_scopes: string[];
    };
    phones: Array<{
        id: string;
        phone_number_id: string;
        display_phone_number: string;
        verified_name: string | null;
        quality_rating: string | null;
        active: boolean;
    }>;
}

export interface WhatsAppOnboardingAttemptRow {
    id: string;
    tenant_id: string;
    seller_id: string;
    source_reference: string;
    destination_key: string;
    status: string;
    error_code: string | null;
    error_message: string | null;
    result: WhatsAppOnboardingAttemptResult | null;
    expires_at: Date;
    consumed_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

const fields =
    "id, tenant_id, seller_id, source_reference, destination_key, status, error_code, error_message, result, expires_at, consumed_at, completed_at, created_at, updated_at";

export interface InsertWhatsAppOnboardingAttemptInput {
    attemptId: string;
    sellerId: string;
    sourceReference: string;
    destinationKey: string;
    expiresAt: Date;
}

// Chamado logo depois que POST /v1/admin/onboarding/attempts responde --
// `attemptId` é o mesmo id atribuído pelo bippa-messaging (chave primária
// aqui), não gerado localmente.
export async function insertWhatsAppOnboardingAttempt(
    client: PoolClient,
    input: InsertWhatsAppOnboardingAttemptInput,
): Promise<WhatsAppOnboardingAttemptRow> {
    const result = await client.query<WhatsAppOnboardingAttemptRow>(
        `INSERT INTO whatsapp_onboarding_attempts
            (id, tenant_id, seller_id, source_reference, destination_key, status, expires_at)
         VALUES ($1, app_tenant_id(), $2, $3, $4, 'pending', $5)
         RETURNING ${fields}`,
        [input.attemptId, input.sellerId, input.sourceReference, input.destinationKey, input.expiresAt],
    );
    return result.rows[0];
}

// Busca por id SEMPRE dentro do escopo do tenant autenticado (RLS via
// app_tenant_id()) -- é assim que a rota de status garante que uma
// administradora nunca reconcilia a tentativa de outro tenant, mesmo
// conhecendo o uuid.
export async function findWhatsAppOnboardingAttemptById(
    client: PoolClient,
    attemptId: string,
): Promise<WhatsAppOnboardingAttemptRow | null> {
    const result = await client.query<WhatsAppOnboardingAttemptRow>(
        `SELECT ${fields} FROM whatsapp_onboarding_attempts WHERE tenant_id = app_tenant_id() AND id = $1`,
        [attemptId],
    );
    return result.rows[0] ?? null;
}

// Tentativa mais recente de uma vendedora ainda não em estado final
// (pending/processing) e ainda não expirada -- usado para a tela retomar o
// polling depois de um refresh de página, sem depender de nada guardado no
// navegador.
export async function findPendingWhatsAppOnboardingAttemptBySeller(
    client: PoolClient,
    sellerId: string,
): Promise<WhatsAppOnboardingAttemptRow | null> {
    const result = await client.query<WhatsAppOnboardingAttemptRow>(
        `SELECT ${fields} FROM whatsapp_onboarding_attempts
         WHERE tenant_id = app_tenant_id() AND seller_id = $1
           AND status IN ('pending', 'processing') AND expires_at > now()
         ORDER BY created_at DESC
         LIMIT 1`,
        [sellerId],
    );
    return result.rows[0] ?? null;
}

// Mapa sellerId -> tentativa pendente, para a rota de status listar todas as
// vendedoras do tenant numa única consulta (evita N+1 na tela de
// Integrações).
export async function listPendingWhatsAppOnboardingAttemptsByTenant(
    client: PoolClient,
): Promise<Map<string, WhatsAppOnboardingAttemptRow>> {
    const result = await client.query<WhatsAppOnboardingAttemptRow>(
        `SELECT DISTINCT ON (seller_id) ${fields} FROM whatsapp_onboarding_attempts
         WHERE tenant_id = app_tenant_id()
           AND status IN ('pending', 'processing') AND expires_at > now()
         ORDER BY seller_id, created_at DESC`,
    );
    return new Map(result.rows.map((row) => [row.seller_id, row]));
}

export interface ReconcileWhatsAppOnboardingAttemptInput {
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
    result: WhatsAppOnboardingAttemptResult | null;
    consumedAt: Date | null;
    completedAt: Date | null;
}

// Grava o resultado de uma consulta a GET /v1/admin/onboarding/attempts/:id
// -- chamado toda vez que o backend reconcilia, mesmo quando o status não
// mudou (idempotente, sempre com now() em updated_at para servir de sinal de
// "consultado recentemente").
export async function reconcileWhatsAppOnboardingAttempt(
    client: PoolClient,
    attemptId: string,
    input: ReconcileWhatsAppOnboardingAttemptInput,
): Promise<WhatsAppOnboardingAttemptRow> {
    const result = await client.query<WhatsAppOnboardingAttemptRow>(
        `UPDATE whatsapp_onboarding_attempts
         SET status = $2, error_code = $3, error_message = $4, result = $5,
             consumed_at = $6, completed_at = $7, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${fields}`,
        [
            attemptId,
            input.status,
            input.errorCode,
            input.errorMessage,
            input.result ? JSON.stringify(input.result) : null,
            input.consumedAt,
            input.completedAt,
        ],
    );
    return result.rows[0];
}

// Marca como `expired` sem depender de uma resposta do bippa-messaging --
// usado quando o backend detecta localmente que expires_at já passou, para
// não fazer uma chamada remota inútil.
export async function markWhatsAppOnboardingAttemptExpired(
    client: PoolClient,
    attemptId: string,
): Promise<WhatsAppOnboardingAttemptRow> {
    const result = await client.query<WhatsAppOnboardingAttemptRow>(
        `UPDATE whatsapp_onboarding_attempts
         SET status = 'expired', updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${fields}`,
        [attemptId],
    );
    return result.rows[0];
}
