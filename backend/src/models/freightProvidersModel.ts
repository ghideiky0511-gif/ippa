import type { PoolClient } from "pg";
import type { FreightProviderKind } from "@/lib/types";

export interface FreightProviderRow {
    id: string; code: string; name: string; kind: FreightProviderKind;
    active: boolean; configuration: Record<string, unknown>;
}

const providerFields = "id, code, name, kind, active, configuration";

async function ensureDefaultFreightProviderRows(client: PoolClient): Promise<void> {
    // A migration 043 criou os providers para os tenants que existiam naquele
    // instante. Tenants provisionados depois dela podem não ter nenhuma opção
    // de frete e, nesse caso, o checkout recebe [] e não consegue avançar.
    // Só preenche uma configuração totalmente ausente: se a loja já tem ao
    // menos um provider (inclusive inativo), sua configuração é preservada.
    await client.query(
        `INSERT INTO freight_providers (tenant_id, code, name, kind, configuration)
         SELECT app_tenant_id(), defaults.code, defaults.name,
                defaults.kind::freight_provider_kind, defaults.configuration::jsonb
         FROM (VALUES
           ('retirada', 'Retirada no showroom', 'pickup', '{}'),
           ('padrao', 'Entrega padrão', 'fixed', '{"price": 19.90, "etaLabel": "5 a 8 dias úteis"}'),
           ('expressa', 'Entrega expressa', 'fixed', '{"price": 39.90, "etaLabel": "2 a 3 dias úteis"}')
         ) AS defaults(code, name, kind, configuration)
         WHERE NOT EXISTS (
           SELECT 1 FROM freight_providers WHERE tenant_id = app_tenant_id()
         )
         ON CONFLICT (tenant_id, code) DO NOTHING`,
    );
}

export async function listActiveFreightProviderRows(client: PoolClient): Promise<FreightProviderRow[]> {
    await ensureDefaultFreightProviderRows(client);
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
