import { z } from 'zod';
import { ClassificationCatalogResultSchema } from './classifications';

export const ErpProviderCredentialFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'password', 'number', 'number-list']),
  required: z.boolean(),
  group: z.enum(['connection', 'publishing', 'orders']).optional(),
});
export type ErpProviderCredentialField = z.infer<typeof ErpProviderCredentialFieldSchema>;

export const ErpIntegrationOptionSchema = z.object({
  provider: z.string(),
  label: z.string(),
  description: z.string(),
  logoPath: z.string().optional(),
  credentialFields: z.array(ErpProviderCredentialFieldSchema),
  configured: z.boolean(),
  active: z.boolean(),
  updatedAt: z.string().nullable(),
  credentials: z.record(z.string(), z.unknown()),
  categoryMappingConfigured: z.boolean().optional(),
});
export type ErpIntegrationOption = z.infer<typeof ErpIntegrationOptionSchema>;

export const ErpIntegrationsResultSchema = z.object({ options: z.array(ErpIntegrationOptionSchema) });
export const ErpIntegrationTestResultSchema = z.object({ ok: z.boolean(), message: z.string().optional() });
export const ErpClassificationCatalogResultSchema = ClassificationCatalogResultSchema;
