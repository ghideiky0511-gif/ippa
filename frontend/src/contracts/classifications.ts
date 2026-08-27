// GERADO a partir de backend/src/contracts — não editar à mão.
// Rode `node scripts/sync-contracts.mjs` (ou `npm run sync-contracts` no
// backend) depois de mudar o arquivo de origem.
import { z } from 'zod';
import { EntityIdSchema, NonNegativeIntegerSchema, RequiredTextSchema } from './shared';

export const CategoryLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type CategoryLevel = z.infer<typeof CategoryLevelSchema>;

export const ClassificationTypeSchema = z.object({
  id: EntityIdSchema,
  integrationId: EntityIdSchema,
  externalCode: RequiredTextSchema,
  label: RequiredTextSchema,
  auxiliaryLabel: z.string().optional(),
  categoryLevel: CategoryLevelSchema.optional(),
  active: z.boolean(),
});
export type ClassificationType = z.infer<typeof ClassificationTypeSchema>;

export const ClassificationSchema = z.object({
  id: EntityIdSchema,
  externalCode: RequiredTextSchema,
  name: RequiredTextSchema,
  auxiliaryName: z.string().optional(),
  parentId: EntityIdSchema.optional(),
  active: z.boolean(),
  type: ClassificationTypeSchema,
});
export type Classification = z.infer<typeof ClassificationSchema>;

export interface CategoryTreeNode {
  id: string;
  name: string;
  level: CategoryLevel;
  children: CategoryTreeNode[];
}

export const CategoryTreeNodeSchema: z.ZodType<CategoryTreeNode> = z.lazy(() => z.object({
  id: EntityIdSchema,
  name: RequiredTextSchema,
  level: CategoryLevelSchema,
  children: z.array(CategoryTreeNodeSchema),
}));

export const ErpClassificationTypeOptionSchema = z.object({
  typeCode: RequiredTextSchema,
  typeName: RequiredTextSchema,
  typeNameAux: z.string().optional(),
  itemCount: NonNegativeIntegerSchema,
  sampleNames: z.array(z.string()),
  categoryLevel: CategoryLevelSchema.optional(),
});
export type ErpClassificationTypeOption = z.infer<typeof ErpClassificationTypeOptionSchema>;

export const CategoryHierarchyMappingSchema = z.object({
  level1TypeCode: RequiredTextSchema,
  level2TypeCode: RequiredTextSchema.optional(),
  level3TypeCode: RequiredTextSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.level3TypeCode && !value.level2TypeCode) {
    context.addIssue({ code: 'custom', path: ['level3TypeCode'], message: 'Configure o nível 2 antes do nível 3.' });
  }
  const codes = [value.level1TypeCode, value.level2TypeCode, value.level3TypeCode].filter(Boolean);
  if (new Set(codes).size !== codes.length) {
    context.addIssue({ code: 'custom', message: 'Cada nível deve usar um tipo de classificação diferente.' });
  }
});
export type CategoryHierarchyMapping = z.infer<typeof CategoryHierarchyMappingSchema>;

export const ClassificationCatalogResultSchema = z.object({
  types: z.array(ErpClassificationTypeOptionSchema),
  mapping: CategoryHierarchyMappingSchema.optional(),
});
export type ClassificationCatalogResult = z.infer<typeof ClassificationCatalogResultSchema>;
