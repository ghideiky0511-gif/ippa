import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, ClassificationKind } from "@/lib/types";
import {
  clearProductOverrideRows,
  listCatalogOrderRows,
  listClassificationRows,
  listProductOverrideRows,
  replaceCatalogOrderRows,
  setClassificationActiveRow,
  setProductOverrideRow,
  type ProductOverrideRow,
} from "@/models/catalogModel";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";

function requireAdministrator(user: AuthUser): void {
  if (user.role !== "administrador" || user.permissions?.adminAccess !== true) throw new ForbiddenError();
}

export interface ClassificationEntry {
  id: string;
  kind: ClassificationKind;
  parentId: string | null;
  name: string;
  active: boolean;
  position: number;
}

export async function listClassifications(tenant: Tenant, actor: AuthUser): Promise<ClassificationEntry[]> {
  requireAdministrator(actor);
  return withTenantTransaction(tenant, actor, async (client) => (await listClassificationRows(client)).map((row) => ({
    id: row.id,
    kind: row.kind,
    parentId: row.parent_id,
    name: row.name,
    active: row.active,
    position: row.position,
  })));
}

export async function setClassificationActive(tenant: Tenant, actor: AuthUser, id: string, value: unknown): Promise<ClassificationEntry> {
  requireAdministrator(actor);
  const body = value as { active?: unknown } | null;
  if (!body || typeof body.active !== "boolean") throw new ValidationError();
  const updated = await withTenantTransaction(tenant, actor, (client) => setClassificationActiveRow(client, id, body.active as boolean));
  if (!updated) throw new NotFoundError("CLASSIFICATION_NOT_FOUND");
  return {
    id: updated.id,
    kind: updated.kind,
    parentId: updated.parent_id,
    name: updated.name,
    active: updated.active,
    position: updated.position,
  };
}

export async function catalogOrder(tenant: Tenant, actor: AuthUser): Promise<string[]> {
  requireAdministrator(actor);
  return withTenantTransaction(tenant, actor, listCatalogOrderRows);
}

export async function replaceCatalogOrder(tenant: Tenant, actor: AuthUser, value: unknown): Promise<string[]> {
  requireAdministrator(actor);
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) throw new ValidationError();
  const ids = [...new Set(value as string[])];
  await withTenantTransaction(tenant, actor, (client) => replaceCatalogOrderRows(client, ids));
  return ids;
}

function validOverride(value: unknown): value is ProductOverrideRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const numberFields = ["suggestedRetailPrice", "markup"];
  const stringFields = ["sku", "category", "subcategory", "collection"];
  const arrayFields = ["similarProductIdsQuickview", "similarProductIdsCart"];
  return numberFields.every((key) => item[key] === undefined || typeof item[key] === "number") &&
    stringFields.every((key) => item[key] === undefined || typeof item[key] === "string") &&
    arrayFields.every((key) => item[key] === undefined ||
      (Array.isArray(item[key]) && (item[key] as unknown[]).every((id) => typeof id === "string")));
}

export async function productOverrides(tenant: Tenant, actor: AuthUser): Promise<Record<string, ProductOverrideRow>> {
  requireAdministrator(actor);
  return withTenantTransaction(tenant, actor, async (client) => Object.fromEntries(
    (await listProductOverrideRows(client)).map((row) => [row.id, row.override]),
  ));
}

export async function replaceProductOverrides(
  tenant: Tenant,
  actor: AuthUser,
  value: unknown,
): Promise<Record<string, ProductOverrideRow>> {
  requireAdministrator(actor);
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.values(value).some((override) => !validOverride(override))) throw new ValidationError();
  const overrides = value as Record<string, ProductOverrideRow>;
  await withTenantTransaction(tenant, actor, async (client) => {
    await clearProductOverrideRows(client);
    for (const [productId, override] of Object.entries(overrides)) {
      await setProductOverrideRow(client, productId, override);
    }
  });
  return overrides;
}
