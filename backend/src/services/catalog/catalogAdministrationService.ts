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
    findProductByReferenceIdRow,
    findProductSourceOriginsByIds,
    listCatalogOrderRows,
  listProductOverrideRows,
  replaceCatalogOrderRows,
    setProductOverrideRow,
    productReferenceIdExists,
    replaceManualProductRow,
    replaceManualProductVariantsRow,
    replaceProductReferenceIdRow,
    listProductVariantsForSyncRow,
    type ProductOverrideRow,
} from "@/models/catalogModel";
import {
  listClassificationRows,
  replaceManualVariantClassificationIdsRow,
  setClassificationActiveRow,
} from "@/models/classificationModel";
import { listAdminProducts } from "./catalogService";
import { listProductCompositionsRow } from "@/models/productCompositionModel";
import {
  findReferenceCodeByProductCodeOnDemand,
  syncReferenceOnDemand,
} from "@/services/erp/catalogSyncService";
import { logger } from "@/lib/logger";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";

function requireAdministrator(user: AuthUser): void {
  if (user.role !== "administrador" || user.permissions?.adminAccess !== true) throw new ForbiddenError();
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
      referenceId: input.referenceId,
      price: input.price,
      media: input.image ? { image: input.image, images: [input.image] } : undefined,
    });
    if (input.variant) {
      const variantId = await insertProductVariantRow(client, product.id, {
        color: input.variant.color,
        size: input.variant.size,
        availability: "in_stock",
        price: input.price,
      });
      if (!await replaceManualVariantClassificationIdsRow(client, variantId, input.variant.classificationIds ?? [])) {
        throw new ValidationError("INVALID_CLASSIFICATION", "Classificação inválida para este tenant.");
      }
    }
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
  logger.info("workspace-product-refresh", "Atualização de produto pelo ERP solicitada", {
    tenantId: tenant.id,
    productId: id,
    actorId: actor.id,
    sourceOrigin: current.source_origin,
    referenceId: current.reference_id,
  });
  let result = await syncReferenceOnDemand(tenant, current.reference_id);
  if (result.status === "not_found") {
    const productCodes = await withTenantTransaction(tenant, actor, async (client) => [
      ...new Set(
        (await listProductVariantsForSyncRow(client, id))
          .map((variant) => variant.bootstrap_external_code?.trim())
          .filter((code): code is string => Boolean(code)),
      ),
    ]);
    logger.info("workspace-product-refresh", "Referência original não encontrada; iniciando fallback por productCode", {
      tenantId: tenant.id,
      productId: id,
      actorId: actor.id,
      referenceId: current.reference_id,
      productCodes: productCodes.join(","),
    });

    // Só o TOTVS Moda implementa findReferenceCodeByProductCode. Nos demais
    // providers, a chamada devolve null e preserva exatamente o not_found
    // original, sem inventar uma regra de reconciliação fora do provider.
    for (const productCode of productCodes) {
      const resolvedReferenceId = await findReferenceCodeByProductCodeOnDemand(tenant, productCode);
      if (!resolvedReferenceId) continue;

      await withTenantTransaction(tenant, actor, async (client) => {
        const productWithReference = await findProductByReferenceIdRow(client, resolvedReferenceId);
        if (productWithReference && productWithReference.id !== id) {
          logger.warn("workspace-product-refresh", "Referência ERP resolvida já pertence a outro produto", {
            tenantId: tenant.id,
            productId: id,
            actorId: actor.id,
            productCode,
            resolvedReferenceId,
            conflictingProductId: productWithReference.id,
          });
          throw new ConflictError("PRODUCT_REFERENCE_ID_TAKEN");
        }
        await replaceProductReferenceIdRow(client, id, resolvedReferenceId);
      });
      logger.info("workspace-product-refresh", "Referência de bootstrap reconciliada com o ERP", {
        tenantId: tenant.id,
        productId: id,
        actorId: actor.id,
        productCode,
        previousReferenceId: current.reference_id,
        resolvedReferenceId,
      });
      result = await syncReferenceOnDemand(tenant, resolvedReferenceId);
      break;
    }
  }
  if (result.status === "not_found") {
    logger.warn("workspace-product-refresh", "Produto não encontrado no ERP após a tentativa de atualização", {
      tenantId: tenant.id,
      productId: id,
      actorId: actor.id,
      referenceId: current.reference_id,
      runId: result.runId,
    });
    return { status: "not_found", runId: result.runId };
  }
  logger.info("workspace-product-refresh", "Produto atualizado pelo ERP", {
    tenantId: tenant.id,
    productId: id,
    actorId: actor.id,
    runId: result.runId,
  });
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
  });
  return getProductAdmin(tenant, actor, id);
}

export async function listClassifications(tenant: Tenant, actor: AuthUser): Promise<ClassificationEntry[]> {
  requireAdministrator(actor);
  return withTenantTransaction(tenant, actor, async (client) => (await listClassificationRows(client)).map((row) => ({
    classification: {
      id: row.id,
      externalCode: row.external_code,
      name: row.name,
      auxiliaryName: row.auxiliary_name ?? undefined,
      parentId: row.parent_id ?? undefined,
      active: row.active,
      type: {
        id: row.classification_type_id,
        integrationId: row.integration_id,
        externalCode: row.type_external_code,
        label: row.type_label,
        auxiliaryLabel: row.type_auxiliary_label ?? undefined,
        categoryLevel: row.category_level ?? undefined,
        active: row.type_active,
      },
    },
    type: {
      id: row.classification_type_id,
      integrationId: row.integration_id,
      externalCode: row.type_external_code,
      label: row.type_label,
      auxiliaryLabel: row.type_auxiliary_label ?? undefined,
      categoryLevel: row.category_level ?? undefined,
      active: row.type_active,
    },
  })));
}

const SetClassificationActiveSchema = z.object({ active: z.boolean() });

export async function setClassificationActive(tenant: Tenant, actor: AuthUser, id: string, value: unknown): Promise<ClassificationEntry> {
  requireAdministrator(actor);
  const parsed = SetClassificationActiveSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
  const updated = await withTenantTransaction(tenant, actor, (client) => setClassificationActiveRow(client, id, parsed.data.active));
  if (!updated) throw new NotFoundError("CLASSIFICATION_NOT_FOUND");
  const type = {
    id: updated.classification_type_id,
    integrationId: updated.integration_id,
    externalCode: updated.type_external_code,
    label: updated.type_label,
    auxiliaryLabel: updated.type_auxiliary_label ?? undefined,
    categoryLevel: updated.category_level ?? undefined,
    active: updated.type_active,
  };
  return {
    classification: {
      id: updated.id,
      externalCode: updated.external_code,
      name: updated.name,
      auxiliaryName: updated.auxiliary_name ?? undefined,
      parentId: updated.parent_id ?? undefined,
      active: updated.active,
      type,
    },
    type,
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
