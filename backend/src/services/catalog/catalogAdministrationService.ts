import { z } from "zod";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import type { ClassificationEntry } from "@/contracts/catalog";
import { ProductOverridesSchema } from "@/contracts/catalog";
import { CreateProductInputSchema } from "@/contracts/products";
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

function classificationSlug(value: string): string {
  const slug = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 127);
  return slug || "categoria";
}

/** Cadastro manual enxuto. Variantes adicionais e estoque ficam para a tela de estoque. */
export async function createProduct(tenant: Tenant, actor: AuthUser, value: unknown): Promise<{ id: string }> {
  requireAdministrator(actor);
  const parsed = CreateProductInputSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inv\u00e1lidos.", parsed.error.issues);
  const input = parsed.data;
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

const SetClassificationActiveSchema = z.object({ active: z.boolean() });

export async function setClassificationActive(tenant: Tenant, actor: AuthUser, id: string, value: unknown): Promise<ClassificationEntry> {
  requireAdministrator(actor);
  const parsed = SetClassificationActiveSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
  const updated = await withTenantTransaction(tenant, actor, (client) => setClassificationActiveRow(client, id, parsed.data.active));
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

const CatalogOrderSchema = z.array(z.string());

export async function replaceCatalogOrder(tenant: Tenant, actor: AuthUser, value: unknown): Promise<string[]> {
  requireAdministrator(actor);
  const parsed = CatalogOrderSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
  const ids = [...new Set(parsed.data)];
  await withTenantTransaction(tenant, actor, (client) => replaceCatalogOrderRows(client, ids));
  return ids;
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
  const parsed = ProductOverridesSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
  const overrides = parsed.data;
  await withTenantTransaction(tenant, actor, async (client) => {
    await clearProductOverrideRows(client);
    for (const [productId, override] of Object.entries(overrides)) {
      await setProductOverrideRow(client, productId, override);
    }
  });
  return overrides;
}
