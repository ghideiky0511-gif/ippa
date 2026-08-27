import type { PoolClient } from 'pg';
import type { CategoryHierarchyMapping, CategoryLevel } from '@/contracts/classifications';
import type { ErpClassificationSnapshot } from '@/erp/types';

export interface ClassificationJoinedRow {
  variant_id?: string;
  id: string;
  classification_type_id: string;
  parent_id: string | null;
  external_code: string;
  name: string;
  auxiliary_name: string | null;
  active: boolean;
  position: number;
  integration_id: string;
  type_external_code: string;
  type_label: string;
  type_auxiliary_label: string | null;
  category_level: CategoryLevel | null;
  type_active: boolean;
}

const joinedFields = `classification.id, classification.classification_type_id,
  classification.parent_id, classification.external_code, classification.name,
  classification.auxiliary_name, classification.active, classification.position,
  type.integration_id, type.external_code AS type_external_code,
  type.label AS type_label, type.auxiliary_label AS type_auxiliary_label,
  type.category_level, type.active AS type_active`;

export async function lockClassificationIntegrationRow(client: PoolClient, integrationId: string): Promise<void> {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext(app_tenant_id()::text || ':' || $1::text))`,
    [integrationId],
  );
}

export async function listVariantClassificationRows(client: PoolClient): Promise<ClassificationJoinedRow[]> {
  const result = await client.query<ClassificationJoinedRow>(
    `SELECT link.variant_id, ${joinedFields}
     FROM variant_classifications link
     JOIN classifications classification
       ON classification.tenant_id = link.tenant_id AND classification.id = link.classification_id
     JOIN classification_types type
       ON type.tenant_id = link.tenant_id AND type.id = link.classification_type_id
     WHERE link.tenant_id = app_tenant_id()
     ORDER BY link.variant_id, type.category_level NULLS LAST, type.label, classification.position, classification.name`,
  );
  return result.rows;
}

export async function listCategoryMenuRows(client: PoolClient): Promise<ClassificationJoinedRow[]> {
  const result = await client.query<ClassificationJoinedRow>(
    `SELECT DISTINCT ${joinedFields}
     FROM classifications classification
     JOIN classification_types type
       ON type.tenant_id = classification.tenant_id AND type.id = classification.classification_type_id
     JOIN variant_classifications link
       ON link.tenant_id = classification.tenant_id AND link.classification_id = classification.id
     JOIN product_variants variant
       ON variant.tenant_id = link.tenant_id AND variant.id = link.variant_id AND variant.is_active
     JOIN products product
       ON product.tenant_id = variant.tenant_id AND product.id = variant.product_id AND product.is_active
     WHERE classification.tenant_id = app_tenant_id()
       AND type.category_level IS NOT NULL AND type.active AND classification.active
     ORDER BY type.category_level, classification.position, classification.name`,
  );
  return result.rows;
}

export async function listClassificationRows(client: PoolClient): Promise<ClassificationJoinedRow[]> {
  const result = await client.query<ClassificationJoinedRow>(
    `SELECT ${joinedFields}
     FROM classifications classification
     JOIN classification_types type
       ON type.tenant_id = classification.tenant_id AND type.id = classification.classification_type_id
     WHERE classification.tenant_id = app_tenant_id()
     ORDER BY type.category_level NULLS LAST, type.label, classification.position, classification.name`,
  );
  return result.rows;
}

export async function listClassificationTypeUsageRows(client: PoolClient, integrationId: string): Promise<Array<{
  external_code: string; label: string; auxiliary_label: string | null; category_level: CategoryLevel | null;
  item_count: number; sample_names: string[];
}>> {
  const result = await client.query<{
    external_code: string; label: string; auxiliary_label: string | null; category_level: CategoryLevel | null;
    item_count: string; sample_names: string[] | null;
  }>(
    `SELECT type.external_code, type.label, type.auxiliary_label, type.category_level,
            count(DISTINCT link.classification_id)::int AS item_count,
            (array_remove(array_agg(DISTINCT classification.name), NULL))[1:3] AS sample_names
     FROM classification_types type
     LEFT JOIN classifications classification ON classification.tenant_id = type.tenant_id
       AND classification.classification_type_id = type.id
     LEFT JOIN variant_classifications link ON link.tenant_id = type.tenant_id
       AND link.classification_type_id = type.id
     WHERE type.tenant_id = app_tenant_id() AND type.integration_id = $1
     GROUP BY type.id
     ORDER BY type.label`,
    [integrationId],
  );
  return result.rows.map((row) => ({ ...row, item_count: Number(row.item_count), sample_names: row.sample_names ?? [] }));
}

export async function setClassificationActiveRow(
  client: PoolClient,
  id: string,
  active: boolean,
): Promise<ClassificationJoinedRow | null> {
  const result = await client.query<ClassificationJoinedRow>(
    `WITH updated AS (
       UPDATE classifications SET active = $2, updated_at = now()
       WHERE tenant_id = app_tenant_id() AND id = $1
       RETURNING *
     )
     SELECT ${joinedFields.replaceAll('classification.', 'updated.')}
     FROM updated
     JOIN classification_types type
       ON type.tenant_id = updated.tenant_id AND type.id = updated.classification_type_id`,
    [id, active],
  );
  return result.rows[0] ?? null;
}

function usableSnapshots(values: ErpClassificationSnapshot[]): Array<Required<Pick<ErpClassificationSnapshot, 'typeCode'>> & ErpClassificationSnapshot & { externalCode: string; displayName: string }> {
  const seen = new Set<string>();
  const result: Array<Required<Pick<ErpClassificationSnapshot, 'typeCode'>> & ErpClassificationSnapshot & { externalCode: string; displayName: string }> = [];
  for (const value of values) {
    if (value.typeCode === undefined) continue;
    const displayName = value.name?.trim() || value.code?.trim();
    if (!displayName) continue;
    const externalCode = value.code?.trim() || `name:${displayName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    const key = `${value.typeCode}:${externalCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...value, typeCode: value.typeCode, externalCode, displayName });
  }
  return result;
}

export async function replaceVariantClassificationsRow(
  client: PoolClient,
  input: { integrationId: string; variantId: string; classifications: ErpClassificationSnapshot[] },
): Promise<void> {
  await client.query(
    `DELETE FROM variant_classifications WHERE tenant_id = app_tenant_id() AND variant_id = $1`,
    [input.variantId],
  );
  const values = usableSnapshots(input.classifications);
  const prepared: Array<typeof values[number] & { typeId: string; level: CategoryLevel | null }> = [];
  for (const value of values) {
    const typeResult = await client.query<{ id: string; category_level: CategoryLevel | null }>(
      `INSERT INTO classification_types (
         tenant_id, integration_id, external_code, label, auxiliary_label
       ) VALUES (app_tenant_id(), $1, $2, $3, $4)
       ON CONFLICT (tenant_id, integration_id, external_code) DO UPDATE SET
         label = EXCLUDED.label, auxiliary_label = EXCLUDED.auxiliary_label,
         active = true, updated_at = now()
       RETURNING id, category_level`,
      [input.integrationId, String(value.typeCode), value.typeName?.trim() || `Tipo ${value.typeCode}`, value.typeNameAux?.trim() || null],
    );
    prepared.push({ ...value, typeId: typeResult.rows[0].id, level: typeResult.rows[0].category_level });
  }
  prepared.sort((left, right) => (left.level ?? 99) - (right.level ?? 99));
  let nearestCategoryParent: string | null = null;
  for (const value of prepared) {
    const parentId: string | null = value.level ? nearestCategoryParent : null;
    const classificationResult: { rows: Array<{ id: string }> } = await client.query<{ id: string }>(
      `INSERT INTO classifications (
         tenant_id, classification_type_id, parent_id, external_code, name, auxiliary_name
       ) VALUES (app_tenant_id(), $1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, classification_type_id, parent_id, external_code) DO UPDATE SET
         name = EXCLUDED.name, auxiliary_name = EXCLUDED.auxiliary_name,
         active = true, updated_at = now()
       RETURNING id`,
      [value.typeId, parentId, value.externalCode, value.displayName, value.nameAux?.trim() || null],
    );
    const classificationId: string = classificationResult.rows[0].id;
    await client.query(
      `INSERT INTO variant_classifications (
         tenant_id, variant_id, classification_id, classification_type_id
       ) VALUES (app_tenant_id(), $1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [input.variantId, classificationId, value.typeId],
    );
    if (value.level) nearestCategoryParent = classificationId;
  }
}

export async function replaceManualVariantClassificationIdsRow(
  client: PoolClient,
  variantId: string,
  classificationIds: string[],
): Promise<boolean> {
  const uniqueIds = [...new Set(classificationIds)];
  const valid = uniqueIds.length === 0 ? [] : (await client.query<{ id: string; classification_type_id: string }>(
    `SELECT id, classification_type_id FROM classifications
     WHERE tenant_id = app_tenant_id() AND id = ANY($1::uuid[])`,
    [uniqueIds],
  )).rows;
  if (valid.length !== uniqueIds.length) return false;
  await client.query(
    `DELETE FROM variant_classifications WHERE tenant_id = app_tenant_id() AND variant_id = $1`,
    [variantId],
  );
  for (const row of valid) {
    await client.query(
      `INSERT INTO variant_classifications (tenant_id, variant_id, classification_id, classification_type_id)
       VALUES (app_tenant_id(), $1, $2, $3)`,
      [variantId, row.id, row.classification_type_id],
    );
  }
  return true;
}

export async function findCategoryHierarchyMappingRow(
  client: PoolClient,
  integrationId: string,
): Promise<CategoryHierarchyMapping | undefined> {
  const result = await client.query<{ external_code: string; category_level: CategoryLevel }>(
    `SELECT external_code, category_level FROM classification_types
     WHERE tenant_id = app_tenant_id() AND integration_id = $1 AND category_level IS NOT NULL
     ORDER BY category_level`,
    [integrationId],
  );
  const byLevel = new Map(result.rows.map((row) => [row.category_level, row.external_code]));
  const level1TypeCode = byLevel.get(1);
  if (!level1TypeCode) return undefined;
  return {
    level1TypeCode,
    level2TypeCode: byLevel.get(2),
    level3TypeCode: byLevel.get(3),
  };
}

export async function rebuildClassificationHierarchyRow(
  client: PoolClient,
  integrationId: string,
): Promise<void> {
  const snapshot = await client.query<{
    variant_id: string; type_code: string; type_name: string; type_name_aux: string | null;
    code: string; name: string; name_aux: string | null;
  }>(
    `SELECT link.variant_id, type.external_code AS type_code, type.label AS type_name,
            type.auxiliary_label AS type_name_aux, classification.external_code AS code,
            classification.name, classification.auxiliary_name AS name_aux
     FROM variant_classifications link
     JOIN classifications classification
       ON classification.tenant_id = link.tenant_id AND classification.id = link.classification_id
     JOIN classification_types type
       ON type.tenant_id = link.tenant_id AND type.id = link.classification_type_id
     WHERE link.tenant_id = app_tenant_id() AND type.integration_id = $1`,
    [integrationId],
  );
  const byVariant = new Map<string, ErpClassificationSnapshot[]>();
  for (const row of snapshot.rows) {
    const typeCode = Number(row.type_code);
    if (!Number.isFinite(typeCode)) continue;
    const values = byVariant.get(row.variant_id) ?? [];
    values.push({ typeCode, typeName: row.type_name, typeNameAux: row.type_name_aux ?? undefined, code: row.code, name: row.name, nameAux: row.name_aux ?? undefined });
    byVariant.set(row.variant_id, values);
  }
  for (const [variantId, classifications] of byVariant) {
    await replaceVariantClassificationsRow(client, { integrationId, variantId, classifications });
  }
  await client.query(
    `DELETE FROM classifications classification
     USING classification_types type
     WHERE classification.tenant_id = app_tenant_id()
       AND type.tenant_id = classification.tenant_id
       AND type.id = classification.classification_type_id
       AND type.integration_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM variant_classifications link
         WHERE link.tenant_id = classification.tenant_id AND link.classification_id = classification.id
       )`,
    [integrationId],
  );
}

export async function saveCategoryHierarchyMappingRow(
  client: PoolClient,
  input: {
    integrationId: string;
    mapping: CategoryHierarchyMapping;
    types: Array<{ typeCode: string; typeName: string; typeNameAux?: string }>;
  },
): Promise<void> {
  await lockClassificationIntegrationRow(client, input.integrationId);
  await client.query(
    `UPDATE classification_types SET category_level = NULL, updated_at = now()
     WHERE tenant_id = app_tenant_id() AND integration_id = $1`,
    [input.integrationId],
  );
  const selected = [input.mapping.level1TypeCode, input.mapping.level2TypeCode, input.mapping.level3TypeCode];
  for (let index = 0; index < selected.length; index += 1) {
    const externalCode = selected[index];
    if (!externalCode) continue;
    const option = input.types.find((type) => type.typeCode === externalCode);
    if (!option) throw new Error(`CLASSIFICATION_TYPE_NOT_FOUND:${externalCode}`);
    await client.query(
      `INSERT INTO classification_types (
         tenant_id, integration_id, external_code, label, auxiliary_label, category_level
       ) VALUES (app_tenant_id(), $1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, integration_id, external_code) DO UPDATE SET
         label = EXCLUDED.label, auxiliary_label = EXCLUDED.auxiliary_label,
         category_level = EXCLUDED.category_level, active = true, updated_at = now()`,
      [input.integrationId, externalCode, option.typeName, option.typeNameAux ?? null, index + 1],
    );
  }
  await rebuildClassificationHierarchyRow(client, input.integrationId);
  await client.query(
    `UPDATE catalog_sync_states SET checkpoint_at = NULL, last_full_sync_at = NULL,
       next_incremental_at = now(), updated_at = now()
     WHERE tenant_id = app_tenant_id() AND integration_id = $1`,
    [input.integrationId],
  );
  await client.query(
    `UPDATE catalog_sync_configs SET enabled = (
       classification_type_code IS NOT NULL AND cardinality(classification_codes) > 0
       AND EXISTS (
         SELECT 1 FROM classification_types type
         WHERE type.tenant_id = catalog_sync_configs.tenant_id
           AND type.integration_id = catalog_sync_configs.integration_id
           AND type.category_level = 1
       )
     ), updated_at = now()
     WHERE tenant_id = app_tenant_id() AND integration_id = $1`,
    [input.integrationId],
  );
}
