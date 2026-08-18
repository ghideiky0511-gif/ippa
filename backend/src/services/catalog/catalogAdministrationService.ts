import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import {
  clearProductOverrideRows,
  listCatalogOrderRows,
  listProductOverrideRows,
  replaceCatalogOrderRows,
  setProductOverrideRow,
  type ProductOverrideRow,
} from "@/models/catalogModel";
import { ForbiddenError, ValidationError } from "@/services/shared/errors";

function requireAdministrator(user: AuthUser): void {
  if (user.role !== "administrador" || user.permissions?.adminAccess !== true) throw new ForbiddenError();
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
