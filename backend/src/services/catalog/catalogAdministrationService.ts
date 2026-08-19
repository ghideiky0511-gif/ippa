import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, ClassificationKind } from "@/lib/types";
import {
    clearProductOverrideRows,
    insertProductRow,
    insertProductVariantRow,
  listCatalogOrderRows,
  listClassificationRows,
  listProductOverrideRows,
  replaceCatalogOrderRows,
  setClassificationActiveRow,
    setProductOverrideRow,
    setPrimaryProductCategoryRow,
    productReferenceIdExists,
    type ProductOverrideRow,
} from "@/models/catalogModel";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";

function requireAdministrator(user: AuthUser): void {
  if (user.role !== "administrador" || user.permissions?.adminAccess !== true) throw new ForbiddenError();
}

export interface CreateProductInput {
  name: string;
  price: number;
  category?: string;
  referenceId?: string;
  description?: string;
  image?: string;
  variant?: { color: string; size: string };
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ValidationError();
  const trimmed = value.trim();
  return trimmed || undefined;
}

function classificationSlug(value: string): string {
  const slug = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 127);
  return slug || "categoria";
}

function parseCreateProduct(value: unknown): CreateProductInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError();
  const body = value as Record<string, unknown>;
  const name = optionalText(body.name);
  const price = body.price;
  if (!name || typeof price !== "number" || !Number.isFinite(price) || price < 0) throw new ValidationError();
  const image = optionalText(body.image);
  if (image) {
    try {
      const url = new URL(image);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch { throw new ValidationError(); }
  }
  const rawVariant = body.variant;
  let variant: CreateProductInput["variant"];
  if (rawVariant !== undefined) {
    if (!rawVariant || typeof rawVariant !== "object" || Array.isArray(rawVariant)) throw new ValidationError();
    const item = rawVariant as Record<string, unknown>;
    const color = optionalText(item.color);
    const size = optionalText(item.size);
    if (!color || !size) throw new ValidationError();
    variant = { color, size };
  }
  return { name, price, category: optionalText(body.category), referenceId: optionalText(body.referenceId),
    description: optionalText(body.description), image, variant };
}

/** Cadastro manual enxuto. Variantes adicionais e estoque ficam para a tela de estoque. */
export async function createProduct(tenant: Tenant, actor: AuthUser, value: unknown): Promise<{ id: string }> {
  requireAdministrator(actor);
  const input = parseCreateProduct(value);
  return withTenantTransaction(tenant, actor, async (client) => {
    if (input.referenceId && await productReferenceIdExists(client, input.referenceId)) throw new ConflictError("PRODUCT_REFERENCE_ID_TAKEN");
    const product = await insertProductRow(client, {
      name: input.name,
      description: input.description,
      category: input.category ?? "Sem categoria",
      referenceId: input.referenceId,
      price: input.price,
      media: input.image ? { image: input.image, images: [input.image] } : undefined,
    });
    if (input.category) await setPrimaryProductCategoryRow(
      client, product.id, input.category, classificationSlug(input.category),
    );
    if (input.variant) await insertProductVariantRow(client, product.id, {
      ...input.variant,
      price: input.price,
    });
    return { id: product.id };
  });
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
  const stringFields = ["referenceId", "category", "subcategory", "collection"];
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
