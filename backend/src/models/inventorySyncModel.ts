import type { PoolClient } from "pg";

export async function applyErpInventorySnapshotRow(
    client: PoolClient,
    value: {
        provider: string;
        integrationId: string;
        variantId: string;
        skuExternalId: string;
        locationExternalId: string;
        locationName?: string;
        quantity: number;
        runId: string;
    },
): Promise<void> {
    const sourceCode = `erp-${value.provider}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 63);
    const locationCode = `erp-${value.locationExternalId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 63);
    const source = await client.query<{ id: string }>(
        `INSERT INTO inventory_sources (tenant_id, kind, code, name, configuration)
         VALUES (app_tenant_id(), 'erp', $1, $2, jsonb_build_object('integrationId', $3::text))
         ON CONFLICT (tenant_id, code) DO UPDATE SET
           name = EXCLUDED.name, active = true, configuration = EXCLUDED.configuration,
           updated_at = now()
         RETURNING id`,
        [sourceCode, value.provider, value.integrationId],
    );
    const sourceId = source.rows[0].id;
    const location = await client.query<{ id: string }>(
        `INSERT INTO inventory_locations (tenant_id, source_id, code, name, kind, active)
         VALUES (app_tenant_id(), $1, $2, $3, 'warehouse', true)
         ON CONFLICT (tenant_id, code) DO UPDATE SET
           source_id = EXCLUDED.source_id, name = EXCLUDED.name, active = true,
           updated_at = now()
         RETURNING id`,
        [sourceId, locationCode, value.locationName || value.locationExternalId],
    );
    const locationId = location.rows[0].id;

    await client.query(
        `INSERT INTO inventory_external_references (
           tenant_id, source_id, variant_id, external_id, metadata
         ) VALUES (
           app_tenant_id(), $1, $2, $3,
           jsonb_build_object('locationExternalId', $4::text)
         )
         ON CONFLICT (tenant_id, source_id, external_id) DO UPDATE SET
           variant_id = EXCLUDED.variant_id,
           metadata = inventory_external_references.metadata || EXCLUDED.metadata,
           updated_at = now()`,
        [sourceId, value.variantId, value.skuExternalId, value.locationExternalId],
    );

    const normalizedQuantity = Math.max(0, Math.trunc(value.quantity));
    const previous = await client.query<{ on_hand_qty: number; reserved_qty: number }>(
        `SELECT on_hand_qty, reserved_qty FROM inventory_balances
         WHERE tenant_id = app_tenant_id() AND variant_id = $1 AND location_id = $2
         FOR UPDATE`,
        [value.variantId, locationId],
    );
    const previousOnHand = previous.rows[0]?.on_hand_qty ?? 0;
    const reserved = Math.min(previous.rows[0]?.reserved_qty ?? 0, normalizedQuantity);
    await client.query(
        `INSERT INTO inventory_balances (
           tenant_id, variant_id, location_id, on_hand_qty, reserved_qty
         ) VALUES (app_tenant_id(), $1, $2, $3, $4)
         ON CONFLICT (tenant_id, variant_id, location_id) DO UPDATE SET
           on_hand_qty = EXCLUDED.on_hand_qty,
           reserved_qty = LEAST(inventory_balances.reserved_qty, EXCLUDED.on_hand_qty),
           updated_at = now()`,
        [value.variantId, locationId, normalizedQuantity, reserved],
    );

    const delta = normalizedQuantity - previousOnHand;
    if (delta === 0) return;
    const externalReference = `catalog-sync:${value.runId}:${value.skuExternalId}:${value.locationExternalId}`;
    await client.query(
        `INSERT INTO inventory_movements (
           tenant_id, variant_id, location_id, source_id, movement_type,
           on_hand_delta, external_reference, metadata
         ) VALUES (
           app_tenant_id(), $1, $2, $3, 'integration_sync', $4, $5,
           jsonb_build_object('rawQuantity', $6::numeric)
         )
         ON CONFLICT (tenant_id, source_id, external_reference)
         WHERE source_id IS NOT NULL AND external_reference IS NOT NULL
         DO NOTHING`,
        [value.variantId, locationId, sourceId, delta, externalReference, value.quantity],
    );
}
