import { z } from "zod";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import type { ClassificationEntry } from "@/contracts/catalog";
import { ProductOverridesSchema } from "@/contracts/catalog";
import { CreateProductInputSchema, UpdateManualProductInputSchema, type ProductAdmin, type ProductSourceOrigin } from "@/contracts/products";
import {
    clearProductOverrideRows,
    insertProductRow,
    insertProductVariantRow,
    findProductByIdRow,
    findProductSourceOriginsByIds,
  listCatalogOrderRows,
  listClassificationRows,
  listProductOverrideRows,
  replaceCatalogOrderRows,
  setClassificationActiveRow,
    setProductOverrideRow,
    setPrimaryProductCategoryRow,
    productReferenceIdExists,
    replaceManualProductRow,
    replaceManualProductVariantsRow,
    type ProductOverrideRow,
} from "@/models/catalogModel";
import { listAdminProducts } from "./catalogService";
import { listProductCompositionsRow } from "@/models/productCompositionModel";
import { syncReferenceOnDemand } from "@/services/erp/catalogSyncService";
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

export function assertProductEditableInWorkspace(sourceOrigin: ProductSourceOrigin): void {
  if (sourceOrigin === "erp") throw new ForbiddenError("ERP_PRODUCT_READ_ONLY");
}

export async function listProductsAdmin(tenant: Tenant, actor: AuthUser): Promise<ProductAdmin[]> {
  requireAdministrator(actor);
  return listAdminProducts(tenant);
}

export async function getProductAdmin(tenant: Tenant, actor: AuthUser, id: string): Promise<ProductAdmin> {
  requireAdministrator(actor);
  const product = (await listAdminProducts(tenant)).find((item) => item.id === id);
  if (!product) throw new NotFoundError("PRODUCT_NOT_FOUND");
  const compositions = await withTenantTransaction(tenant, actor, (client) => listProductCompositionsRow(client, id));
  return {
    ...product,
    compositions: compositions.map((composition) => ({
      id: composition.id,
      description: composition.description,
      typeDescription: composition.type_description ?? undefined,
      items: composition.items,
    })),
  };
}

export async function refreshProductFromErp(
  tenant: Tenant,
  actor: AuthUser,
  id: string,
): Promise<{ status: "updated"; runId: string; product: ProductAdmin } | { status: "not_found"; runId: string }> {
  requireAdministrator(actor);
  const current = await withTenantTransaction(tenant, actor, (client) => findProductByIdRow(client, id));
  if (!current) throw new NotFoundError("PRODUCT_NOT_FOUND");
  if (current.source_origin === "manual" || !current.reference_id) {
    throw new ValidationError("INVALID_INPUT", "Este produto não possui uma referência vinculada ao ERP.");
  }
  const result = await syncReferenceOnDemand(tenant, current.reference_id);
  if (result.status === "not_found") return { status: "not_found", runId: result.runId };
  return { status: "updated", runId: result.runId, product: await getProductAdmin(tenant, actor, id) };
}

export async function updateManualProduct(
  tenant: Tenant,
  actor: AuthUser,
  id: string,
  value: unknown,
): Promise<ProductAdmin> {
  requireAdministrator(actor);
  const parsed = UpdateManualProductInputSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
  const input = parsed.data;
  await withTenantTransaction(tenant, actor, async (client) => {
    const current = await findProductByIdRow(client, id);
    if (!current) throw new NotFoundError("PRODUCT_NOT_FOUND");
    assertProductEditableInWorkspace(current.source_origin);
    if (input.referenceId && input.referenceId !== current.reference_id && await productReferenceIdExists(client, input.referenceId)) {
      throw new ConflictError("PRODUCT_REFERENCE_ID_TAKEN");
    }
    const attributes = { ...(current.attributes as Record<string, unknown>) };
    delete attributes.manualOverride;
    await replaceManualProductRow(client, id, {
      name: input.name,
      description: input.description,
      category: input.category,
      subcategory: input.subcategory,
      collection: input.collection,
      brand: input.brand,
      referenceId: input.referenceId,
      price: input.price,
      suggestedRetailPrice: input.suggestedRetailPrice,
      markup: input.markup,
      media: {
        image: input.image,
        images: input.images,
        imagesByColor: input.imagesByColor,
        videoUrl: input.videoUrl,
      },
      attributes: {
        ...attributes,
        ...(input.similarProductIdsQuickview ? { similarProductIdsQuickview: input.similarProductIdsQuickview } : {}),
        ...(input.similarProductIdsCart ? { similarProductIdsCart: input.similarProductIdsCart } : {}),
      },
    });
    await replaceManualProductVariantsRow(client, id, input.variants);
    await setPrimaryProductCategoryRow(client, id, input.category, classificationSlug(input.category));
  });
  return getProductAdmin(tenant, actor, id);
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
    const origins = await findProductSourceOriginsByIds(client, Object.keys(overrides));
    if (Object.entries(origins).some(([, source]) => source === "erp")) {
      throw new ForbiddenError("ERP_PRODUCT_READ_ONLY");
    }
    await clearProductOverrideRows(client);
    for (const [productId, override] of Object.entries(overrides)) {
      await setProductOverrideRow(client, productId, override);
    }
  });
  return overrides;
}
