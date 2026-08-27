import type { PoolClient } from "pg";
import type { FreightProviderKind } from "@/lib/types";

export interface FreightQuoteRow {
    id: string; order_session_id: string; provider_id: string | null; kind: FreightProviderKind;
    label: string; price: string; eta_label: string | null; selected: boolean;
}

const quoteFields = "id, order_session_id, provider_id, kind, label, price, eta_label, selected";

export interface FreightQuoteWriteRow {
    providerId: string | null; kind: FreightProviderKind; label: string; price: number;
    etaLabel: string | null; destinationCep?: string;
}

export async function insertFreightQuoteRows(
    client: PoolClient,
    sessionId: string,
    quotes: FreightQuoteWriteRow[],
): Promise<FreightQuoteRow[]> {
    const rows: FreightQuoteRow[] = [];
    for (const quote of quotes) {
        const result = await client.query<FreightQuoteRow>(
            `INSERT INTO freight_quotes (tenant_id, order_session_id, provider_id, kind, label, price, eta_label, destination_cep)
             VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7)
             RETURNING ${quoteFields}`,
            [sessionId, quote.providerId, quote.kind, quote.label, quote.price, quote.etaLabel,
             quote.destinationCep ?? null],
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
// migration 043) garante que só uma linha por sessão fica marcada -- por
// isso o UPDATE abaixo pode setar `selected` em massa numa única instrução
// sem violar a constraint.
export async function selectFreightQuoteRow(
    client: PoolClient,
    sessionId: string,
    quoteId: string,
): Promise<FreightQuoteRow | null> {
    const result = await client.query<FreightQuoteRow>(
        `UPDATE freight_quotes SET selected = (id = $2)
         WHERE tenant_id = app_tenant_id() AND order_session_id = $1
         RETURNING ${quoteFields}`,
        [sessionId, quoteId],
    );
    return result.rows.find((row) => row.id === quoteId) ?? null;
}
