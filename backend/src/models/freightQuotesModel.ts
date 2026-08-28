import type { PoolClient } from "pg";
import type { DeliveryFulfillmentMode, FreightProviderKind } from "@/lib/types";

export interface FreightQuoteRow {
    id: string; order_session_id: string; provider_id: string | null; kind: FreightProviderKind;
    label: string; price: string; eta_label: string | null; selected: boolean;
    delivery_type_id: string | null; delivery_offering_id: string | null; delivery_provider_id: string | null;
    delivery_fulfillment_mode: DeliveryFulfillmentMode | null;
    delivery_type_name: string | null; delivery_provider_name: string | null;
    destination_cep: string | null;
}

const quoteFields = "id, order_session_id, provider_id, kind, label, price, eta_label, selected, delivery_type_id, delivery_offering_id, delivery_provider_id, delivery_fulfillment_mode, delivery_type_name, delivery_provider_name, destination_cep";

export interface FreightQuoteWriteRow {
    providerId: string | null; kind: FreightProviderKind; label: string; price: number;
    etaLabel: string | null; destinationCep?: string;
    deliveryTypeId: string; deliveryOfferingId: string; deliveryProviderId: string;
    fulfillmentMode: DeliveryFulfillmentMode; deliveryTypeName: string; deliveryProviderName: string;
}

export async function insertFreightQuoteRows(
    client: PoolClient,
    sessionId: string,
    quotes: FreightQuoteWriteRow[],
): Promise<FreightQuoteRow[]> {
    const rows: FreightQuoteRow[] = [];
    for (const quote of quotes) {
        const result = await client.query<FreightQuoteRow>(
            `INSERT INTO freight_quotes (
               tenant_id, order_session_id, provider_id, kind, label, price, eta_label, destination_cep,
               delivery_type_id, delivery_offering_id, delivery_provider_id,
               delivery_fulfillment_mode, delivery_type_name, delivery_provider_name
             )
             VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING ${quoteFields}`,
            [sessionId, quote.providerId, quote.kind, quote.label, quote.price, quote.etaLabel,
             quote.destinationCep ?? null, quote.deliveryTypeId, quote.deliveryOfferingId,
             quote.deliveryProviderId, quote.fulfillmentMode, quote.deliveryTypeName,
             quote.deliveryProviderName],
        );
        rows.push(result.rows[0]);
    }
    return rows;
}

export async function listFreightQuoteRowsForSession(client: PoolClient, sessionId: string): Promise<FreightQuoteRow[]> {
    const result = await client.query<FreightQuoteRow>(
        `SELECT ${quoteFields} FROM freight_quotes
         WHERE tenant_id = app_tenant_id() AND order_session_id = $1 ORDER BY created_at DESC`,
        [sessionId],
    );
    return result.rows;
}

export async function findFreightQuoteRow(client: PoolClient, id: string): Promise<FreightQuoteRow | null> {
    const result = await client.query<FreightQuoteRow>(
        `SELECT ${quoteFields} FROM freight_quotes WHERE tenant_id = app_tenant_id() AND id = $1`, [id],
    );
    return result.rows[0] ?? null;
}

// O índice único parcial (tenant_id, order_session_id) WHERE selected (ver
// migration 043) garante que só uma linha por sessão fica marcada. Setar
// `selected` em massa numa única instrução (`selected = (id = $2)`) parece
// seguro mas NÃO é: dentro de um único UPDATE o Postgres verifica o índice
// linha a linha, na ordem (não garantida) do scan -- se a linha nova for
// processada antes da antiga ser desmarcada, as duas ficam `true` ao mesmo
// tempo e o _bt_check_unique estoura duplicate key. Por isso desmarca tudo
// primeiro (numa instrução separada) e só depois marca a nova.
export async function selectFreightQuoteRow(
    client: PoolClient,
    sessionId: string,
    quoteId: string,
): Promise<FreightQuoteRow | null> {
    await client.query(
        `UPDATE freight_quotes SET selected = false
         WHERE tenant_id = app_tenant_id() AND order_session_id = $1 AND selected`,
        [sessionId],
    );
    const result = await client.query<FreightQuoteRow>(
        `UPDATE freight_quotes SET selected = true
         WHERE tenant_id = app_tenant_id() AND order_session_id = $1 AND id = $2
         RETURNING ${quoteFields}`,
        [sessionId, quoteId],
    );
    return result.rows[0] ?? null;
}
