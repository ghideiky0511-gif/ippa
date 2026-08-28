import type { PoolClient } from "pg";
import type { DeliveryFulfillmentMode, DeliveryPricingMode, DeliveryProviderKind } from "@/lib/types";

export interface DeliveryConfigurationRow {
    id: string;
    code: "pickup" | "address_delivery";
    fulfillment_mode: DeliveryFulfillmentMode;
    name: string;
    active: boolean;
    sort_order: number;
    offering_id: string;
    pricing_mode: DeliveryPricingMode;
    fixed_price: string | null;
    eta_label: string | null;
    offering_active: boolean;
    provider_id: string;
    provider_code: string;
    provider_kind: DeliveryProviderKind;
    provider_name: string;
    provider_company_id: string | null;
    provider_active: boolean;
}

const deliveryConfigurationFields = `
  dt.id, dt.code, dt.fulfillment_mode, dt.name, dt.active, dt.sort_order,
  dof.id AS offering_id, dof.pricing_mode, dof.fixed_price, dof.eta_label,
  dof.active AS offering_active,
  dp.id AS provider_id, dp.code AS provider_code, dp.kind AS provider_kind,
  dp.name AS provider_name, dp.company_id AS provider_company_id,
  dp.active AS provider_active`;

const deliveryConfigurationJoin = `
  FROM delivery_types dt
  JOIN delivery_offerings dof
    ON dof.tenant_id = dt.tenant_id AND dof.delivery_type_id = dt.id
  JOIN delivery_providers dp
    ON dp.tenant_id = dof.tenant_id AND dp.id = dof.provider_id`;

export async function listDeliveryConfigurationRows(client: PoolClient): Promise<DeliveryConfigurationRow[]> {
    const result = await client.query<DeliveryConfigurationRow>(
        `SELECT ${deliveryConfigurationFields} ${deliveryConfigurationJoin}
         WHERE dt.tenant_id = app_tenant_id()
         ORDER BY dt.sort_order, dt.code`,
    );
    return result.rows;
}

export async function listActiveDeliveryConfigurationRows(client: PoolClient): Promise<DeliveryConfigurationRow[]> {
    const result = await client.query<DeliveryConfigurationRow>(
        `SELECT ${deliveryConfigurationFields} ${deliveryConfigurationJoin}
         WHERE dt.tenant_id = app_tenant_id()
           AND dt.active AND dof.active AND dp.active
           AND dof.pricing_mode = 'fixed'
         ORDER BY dt.sort_order, dt.code`,
    );
    return result.rows;
}

export async function findActiveDeliveryOfferingRow(
    client: PoolClient,
    offeringId: string,
): Promise<DeliveryConfigurationRow | null> {
    const result = await client.query<DeliveryConfigurationRow>(
        `SELECT ${deliveryConfigurationFields} ${deliveryConfigurationJoin}
         WHERE dt.tenant_id = app_tenant_id() AND dof.id = $1
           AND dt.active AND dof.active AND dp.active
           AND dof.pricing_mode = 'fixed'`,
        [offeringId],
    );
    return result.rows[0] ?? null;
}

export async function findActiveDeliveryOfferingByTypeCode(
    client: PoolClient,
    code: "pickup" | "address_delivery",
): Promise<DeliveryConfigurationRow | null> {
    const result = await client.query<DeliveryConfigurationRow>(
        `SELECT ${deliveryConfigurationFields} ${deliveryConfigurationJoin}
         WHERE dt.tenant_id = app_tenant_id() AND dt.code = $1
           AND dt.active AND dof.active AND dp.active
           AND dof.pricing_mode = 'fixed'`,
        [code],
    );
    return result.rows[0] ?? null;
}

export async function findDeliveryConfigurationRow(
    client: PoolClient,
    deliveryTypeId: string,
): Promise<DeliveryConfigurationRow | null> {
    const result = await client.query<DeliveryConfigurationRow>(
        `SELECT ${deliveryConfigurationFields} ${deliveryConfigurationJoin}
         WHERE dt.tenant_id = app_tenant_id() AND dt.id = $1`,
        [deliveryTypeId],
    );
    return result.rows[0] ?? null;
}

export async function countOtherActiveDeliveryTypes(client: PoolClient, deliveryTypeId: string): Promise<number> {
    const result = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM delivery_types
         WHERE tenant_id = app_tenant_id() AND active AND id <> $1`,
        [deliveryTypeId],
    );
    return Number(result.rows[0]?.count ?? 0);
}

export async function updateDeliveryConfigurationRow(
    client: PoolClient,
    deliveryTypeId: string,
    value: { name?: string; active?: boolean; sortOrder?: number; fixedPrice?: number; etaLabel?: string | null },
): Promise<DeliveryConfigurationRow | null> {
    const existing = await findDeliveryConfigurationRow(client, deliveryTypeId);
    if (!existing) return null;
    await client.query(
        `UPDATE delivery_types
         SET name = COALESCE($2, name), active = COALESCE($3, active),
             sort_order = COALESCE($4, sort_order), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [deliveryTypeId, value.name ?? null, value.active ?? null, value.sortOrder ?? null],
    );
    await client.query(
        `UPDATE delivery_offerings
         SET fixed_price = COALESCE($2, fixed_price),
             eta_label = CASE WHEN $3::boolean THEN $4 ELSE eta_label END,
             updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [existing.offering_id, value.fixedPrice ?? null, Object.hasOwn(value, "etaLabel"), value.etaLabel ?? null],
    );
    return findDeliveryConfigurationRow(client, deliveryTypeId);
}

export async function insertDefaultDeliveryConfigurationRows(
    client: PoolClient,
    tenantId: string,
    tenantName: string,
): Promise<void> {
    await client.query(
        `INSERT INTO delivery_providers (tenant_id, code, kind, name)
         VALUES ($1, 'own_company', 'internal', $2)
         ON CONFLICT (tenant_id, code) DO NOTHING`,
        [tenantId, tenantName],
    );
    await client.query(
        `INSERT INTO delivery_types (tenant_id, code, fulfillment_mode, name, sort_order)
         VALUES
           ($1, 'pickup', 'pickup', 'Retirada no local', 10),
           ($1, 'address_delivery', 'address_delivery', 'Entrega no endereço', 20)
         ON CONFLICT (tenant_id, code) DO NOTHING`,
        [tenantId],
    );
    await client.query(
        `INSERT INTO delivery_offerings
           (tenant_id, delivery_type_id, provider_id, pricing_mode, fixed_price, eta_label)
         SELECT dt.tenant_id, dt.id, dp.id, 'fixed',
                CASE dt.code WHEN 'pickup' THEN 0 ELSE 19.90 END,
                CASE dt.code WHEN 'pickup' THEN NULL ELSE '5 a 8 dias úteis' END
         FROM delivery_types dt
         JOIN delivery_providers dp ON dp.tenant_id = dt.tenant_id AND dp.code = 'own_company'
         WHERE dt.tenant_id = $1
         ON CONFLICT (tenant_id, delivery_type_id, provider_id) DO NOTHING`,
        [tenantId],
    );
}

export async function syncOwnCompanyDeliveryProviderRow(
    client: PoolClient,
    company: { id: string; nomeFantasia: string | null; razaoSocial: string; active: boolean; isMatriz: boolean },
): Promise<void> {
    if (!company.active || !company.isMatriz) return;
    await client.query(
        `UPDATE delivery_providers
         SET company_id = $1, name = $2, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND code = 'own_company'`,
        [company.id, company.nomeFantasia?.trim() || company.razaoSocial],
    );
}
