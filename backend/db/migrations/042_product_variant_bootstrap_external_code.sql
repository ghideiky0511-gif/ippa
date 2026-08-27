-- O bootstrap Vesti roda sempre antes de existir integração ERP
-- (VESTI_BOOTSTRAP_AFTER_ERP em vestiCatalogService.ts), então não pode usar
-- erp_external_references (integration_id é NOT NULL lá). Esta coluna guarda
-- o código do produto no feed de origem do bootstrap (g:id do Vesti, que
-- para providers TOTVS Moda é o productCode interno), separado de
-- product_variants.sku (que é o productSku/código de barra usado pelo sync
-- de ERP) para nunca mais misturar os dois namespaces.
ALTER TABLE product_variants ADD COLUMN bootstrap_external_code text NULL;

CREATE UNIQUE INDEX product_variants_tenant_bootstrap_external_code_key
  ON product_variants (tenant_id, bootstrap_external_code)
  WHERE bootstrap_external_code IS NOT NULL;
