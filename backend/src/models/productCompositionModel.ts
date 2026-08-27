import type { PoolClient } from "pg";
import type { ErpCompositionSnapshot } from "@/erp/types";

export interface ProductCompositionRow {
    id: string;
    description: string;
    type_description: string | null;
    items: Array<{ material: string; percentage: number }>;
}

export async function listProductCompositionsRow(
    client: PoolClient,
    productId: string,
): Promise<ProductCompositionRow[]> {
    const { rows } = await client.query<{
        composition_id: string;
        description: string;
        type_description: string | null;
        material: string | null;
        percentage: string | null;
    }>(
        `SELECT composition.id AS composition_id, composition.description,
                composition.type_description, item.material, item.percentage
         FROM product_compositions composition
         LEFT JOIN product_composition_items item ON item.composition_id = composition.id
           AND item.tenant_id = app_tenant_id()
         WHERE composition.tenant_id = app_tenant_id() AND composition.product_id = $1
         ORDER BY composition.type_description NULLS LAST, composition.created_at, item.sort_order, item.created_at`,
        [productId],
    );
    const compositions = new Map<string, ProductCompositionRow>();
    for (const row of rows) {
        const composition = compositions.get(row.composition_id) ?? {
            id: row.composition_id,
            description: row.description,
            type_description: row.type_description,
            items: [],
        };
        if (row.material && row.percentage !== null) {
            composition.items.push({ material: row.material, percentage: Number(row.percentage) });
        }
        compositions.set(row.composition_id, composition);
    }
    return [...compositions.values()];
}

// Substitui tudo a cada atualização (delete+insert na mesma transação) —
// composição muda raramente e por referência inteira, não há necessidade de
// diff incremental entre o que já existia e o que veio agora do ERP.
export async function replaceProductCompositionsRow(
    client: PoolClient,
    input: {
        productId: string;
        provider: string;
        compositions: ErpCompositionSnapshot[];
    },
): Promise<void> {
    const { productId, provider, compositions } = input;
    await client.query(
        `DELETE FROM product_compositions
         WHERE tenant_id = app_tenant_id() AND product_id = $1 AND provider = $2`,
        [productId, provider],
    );
    for (const composition of compositions) {
        const { rows } = await client.query<{ id: string }>(
            `INSERT INTO product_compositions (
                tenant_id, product_id, provider, external_code, description,
                type_description, external_group_code, group_description
            ) VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7)
            RETURNING id`,
            [
                productId,
                provider,
                composition.externalCode,
                composition.description,
                composition.typeDescription ?? null,
                composition.externalGroupCode ?? null,
                composition.groupDescription ?? null,
            ],
        );
        const compositionId = rows[0].id;
        for (const [index, item] of composition.items.entries()) {
            await client.query(
                `INSERT INTO product_composition_items (
                    tenant_id, composition_id, external_code, material, percentage, sort_order
                ) VALUES (app_tenant_id(), $1, $2, $3, $4, $5)`,
                [compositionId, item.externalCode ?? null, item.material, item.percentage, index],
            );
        }
    }
}
