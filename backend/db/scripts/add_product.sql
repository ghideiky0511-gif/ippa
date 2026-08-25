-- Uso (psql):
--   psql "$DATABASE_URL" -v tenant_slug='minha-loja' -v name='Camiseta Basic' \
--     -v price='49.90' -v reference_id='CAM-BASIC-001' -v category='Camisetas' \
--     -v description='' -v image_url='https://exemplo.com/camiseta.jpg' \
--     -v color='Preto' -v size='M' -f backend/db/scripts/add_product.sql
--
-- `color` e `size` são opcionais, mas devem ser enviados juntos. Variantes
-- adicionais são cadastradas depois na tela/rotina de estoque.

\if :{?tenant_slug}
\else
  \echo 'Informe -v tenant_slug=...'
  \quit
\endif
\if :{?name}
\else
  \echo 'Informe -v name=...'
  \quit
\endif
\if :{?price}
\else
  \echo 'Informe -v price=...'
  \quit
\endif
\if :{?reference_id}
\else
  \set reference_id ''
\endif
\if :{?category}
\else
  \set category ''
\endif
\if :{?description}
\else
  \set description ''
\endif
\if :{?image_url}
\else
  \set image_url ''
\endif
\if :{?color}
\else
  \set color ''
\endif
\if :{?size}
\else
  \set size ''
\endif

BEGIN;

SELECT set_config('app.tenant_id', id::text, true)
FROM tenants
WHERE slug = :'tenant_slug' AND active = true;

SELECT 1 / CASE
  WHEN current_setting('app.tenant_id', true) IS NOT NULL
   AND current_setting('app.tenant_id', true) <> '' THEN 1
  ELSE 0
END;

-- Falha antes do INSERT caso apenas uma metade da variante tenha sido enviada.
SELECT 1 / CASE
  WHEN (NULLIF(:'color', '') IS NULL) = (NULLIF(:'size', '') IS NULL) THEN 1
  ELSE 0
END;

WITH category_type AS (
  SELECT id FROM classification_types
  WHERE tenant_id = app_tenant_id() AND kind = 'category'
), canonical_category AS (
  INSERT INTO classifications (tenant_id, classification_type_id, name, slug)
  SELECT app_tenant_id(), id, :'category',
    COALESCE(NULLIF(lower(trim(both '-' FROM regexp_replace(:'category', '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'categoria')
  FROM category_type
  WHERE NULLIF(:'category', '') IS NOT NULL
  ON CONFLICT (tenant_id, classification_type_id, parent_id, slug)
  DO UPDATE SET name = EXCLUDED.name, updated_at = now()
  RETURNING id, classification_type_id
), new_product AS (
  INSERT INTO products (tenant_id, name, description, category, reference_id, price, media)
  VALUES (
    app_tenant_id(),
    :'name',
    COALESCE(NULLIF(:'description', ''), ''),
    COALESCE(NULLIF(:'category', ''), 'Sem categoria'),
    NULLIF(:'reference_id', ''),
    :'price'::numeric(12,2),
    CASE WHEN NULLIF(:'image_url', '') IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('image', :'image_url', 'images', jsonb_build_array(:'image_url')) END
  )
  RETURNING id
), category_link AS (
  INSERT INTO product_classifications (tenant_id, product_id, classification_id, classification_type_id, is_primary)
  SELECT app_tenant_id(), product.id, category.id, category.classification_type_id, true
  FROM new_product product
  CROSS JOIN canonical_category category
  ON CONFLICT (tenant_id, product_id, classification_id)
  DO UPDATE SET is_primary = true
)
INSERT INTO product_variants (tenant_id, product_id, color, size, price, availability)
SELECT app_tenant_id(), id, :'color', :'size', :'price'::numeric(12,2), 'in_stock'
FROM new_product
WHERE NULLIF(:'color', '') IS NOT NULL AND NULLIF(:'size', '') IS NOT NULL;

COMMIT;
