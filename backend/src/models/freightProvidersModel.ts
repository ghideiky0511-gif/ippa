import type { PoolClient } from "pg";
import type { FreightProviderKind } from "@/lib/types";

export interface FreightProviderRow {
    id: string; code: string; name: string; kind: FreightProviderKind;
    active: boolean; configuration: Record<string, unknown>;
}

const providerFields = "id, code, name, kind, active, configuration";

export async function listActiveFreightProviderRows(client: PoolClient): Promise<FreightProviderRow[]> {
    const result = await client.query<FreightProviderRow>(
        `SELECT ${providerFields} FROM freight_providers
         WHERE tenant_id = app_tenant_id() AND active ORDER BY code`,
    );
    return result.rows;
}

export async function findFreightProviderRow(client: PoolClient, id: string): Promise<FreightProviderRow | null> {
    const result = await client.query<FreightProviderRow>(
        `SELECT ${providerFields} FROM freight_providers WHERE tenant_id = app_tenant_id() AND id = $1`, [id],
    );
    return result.rows[0] ?? null;
}
