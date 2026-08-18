-- Completa o backfill das classificações legadas. A 006 tratou categorias
-- primeiro por serem a raiz da hierarquia; esta migration mantém 006 imutável
-- depois de aplicada e cobre os demais campos de compatibilidade.

INSERT INTO classifications (tenant_id, classification_type_id, parent_id, name, slug)
SELECT DISTINCT product.tenant_id, subcategory_type.id, category.id, product.subcategory,
  lower(trim(both '-' FROM regexp_replace(product.subcategory, '[^a-zA-Z0-9]+', '-', 'g')))
FROM products product
JOIN classification_types subcategory_type
  ON subcategory_type.tenant_id = product.tenant_id AND subcategory_type.kind = 'subcategory'
LEFT JOIN classification_types category_type
  ON category_type.tenant_id = product.tenant_id AND category_type.kind = 'category'
LEFT JOIN classifications category
  ON category.tenant_id = product.tenant_id
  AND category.classification_type_id = category_type.id
  AND category.parent_id IS NULL
  AND category.name = product.category
WHERE product.subcategory IS NOT NULL AND product.subcategory <> ''
ON CONFLICT (tenant_id, classification_type_id, parent_id, slug) DO NOTHING;

INSERT INTO product_classifications (tenant_id, product_id, classification_id, classification_type_id)
SELECT product.tenant_id, product.id, classification.id, type.id
FROM products product
JOIN classification_types type ON type.tenant_id = product.tenant_id AND type.kind = 'subcategory'
LEFT JOIN classification_types category_type
  ON category_type.tenant_id = product.tenant_id AND category_type.kind = 'category'
LEFT JOIN classifications category
  ON category.tenant_id = product.tenant_id
  AND category.classification_type_id = category_type.id
  AND category.parent_id IS NULL
  AND category.name = product.category
JOIN classifications classification
  ON classification.tenant_id = product.tenant_id
  AND classification.classification_type_id = type.id
  AND classification.parent_id IS NOT DISTINCT FROM category.id
  AND classification.name = product.subcategory
WHERE product.subcategory IS NOT NULL AND product.subcategory <> ''
ON CONFLICT DO NOTHING;

INSERT INTO classifications (tenant_id, classification_type_id, name, slug)
SELECT DISTINCT product.tenant_id, type.id, source.name,
  lower(trim(both '-' FROM regexp_replace(source.name, '[^a-zA-Z0-9]+', '-', 'g')))
FROM products product
JOIN LATERAL (VALUES ('collection'::classification_kind, product.collection), ('brand'::classification_kind, product.brand)) AS source(kind, name) ON true
JOIN classification_types type ON type.tenant_id = product.tenant_id AND type.kind = source.kind
WHERE source.name IS NOT NULL AND source.name <> ''
ON CONFLICT (tenant_id, classification_type_id, parent_id, slug) DO NOTHING;

INSERT INTO product_classifications (tenant_id, product_id, classification_id, classification_type_id)
SELECT product.tenant_id, product.id, classification.id, type.id
FROM products product
JOIN LATERAL (VALUES ('collection'::classification_kind, product.collection), ('brand'::classification_kind, product.brand)) AS source(kind, name) ON true
JOIN classification_types type ON type.tenant_id = product.tenant_id AND type.kind = source.kind
JOIN classifications classification
  ON classification.tenant_id = product.tenant_id
  AND classification.classification_type_id = type.id
  AND classification.parent_id IS NULL
  AND classification.name = source.name
WHERE source.name IS NOT NULL AND source.name <> ''
ON CONFLICT DO NOTHING;
