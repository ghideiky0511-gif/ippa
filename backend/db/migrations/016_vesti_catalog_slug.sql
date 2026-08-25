-- Config para o import de catálogo externo da Vesti (backend/src/catalog/vesti).
-- O slug fica em store_settings, a mesma tabela singleton por tenant usada
-- para outras configs simples (ver default_markup, assignment_strategy).
-- Reconciliação de produto usa a coluna products.reference_id já existente
-- (migration 015_products_reference_id.sql), com o REF da Vesti como valor.
ALTER TABLE store_settings ADD COLUMN vesti_catalog_slug text;
