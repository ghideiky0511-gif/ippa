-- products.sku conflava dois conceitos: "referência" (REF, nível produto,
-- vinda do ERP como TOTVS Moda ReferenceCode) e "SKU" (nível variante, que já
-- tem sua própria coluna em product_variants.sku). Corrige o nome para o que
-- o campo realmente representa. Continua texto livre, não UUID: o valor é o
-- código bruto que cada ERP entrega (alfanumérico, formato varia por
-- provider), não um identificador nosso — products.id (uuid) já é o
-- identificador interno.
ALTER TABLE products RENAME COLUMN sku TO reference_id;
ALTER TABLE products RENAME CONSTRAINT products_tenant_id_sku_key TO products_tenant_id_reference_id_key;
