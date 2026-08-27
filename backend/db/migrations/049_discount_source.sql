-- O sync de ERP passa a poder gravar o preço promocional devolvido pelo
-- provider como um desconto "peças específicas" da peça, reaproveitando a
-- mesma leitura (activeDiscount/ProductPrice) que os descontos manuais já
-- usam. replaceDiscounts (tela /descontos) faz DELETE + INSERT de tudo --
-- sem marcar a origem, um desconto de ERP salvo ali seria apagado na
-- próxima vez que o lojista editasse qualquer desconto manual. `source`
-- deixa deleteDiscountRows restrito a 'manual', e `product_id` (só
-- preenchido para source='erp', sempre 1:1 com o produto promocionado)
-- serve de chave de upsert idempotente pro sync -- a relação de verdade
-- "quais produtos este desconto atinge" continua em discount_products,
-- sem mudança de leitura para o catálogo.
CREATE TYPE discount_source AS ENUM ('manual', 'erp');

ALTER TABLE discounts
  ADD COLUMN source discount_source NOT NULL DEFAULT 'manual',
  ADD COLUMN product_id uuid REFERENCES products(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX discounts_erp_product_unique
  ON discounts (tenant_id, product_id)
  WHERE source = 'erp';
