-- Checkout deixava todo pedido "pago" na hora (talão, link de pagamento e
-- checkout da cliente no catálogo) sem nenhuma integração de pagamento real
-- por trás -- as páginas públicas já admitiam isso ("Simulação -- nenhuma
-- cobrança real é processada"). Novo lifecycle, usando a separação física
-- que a migration 023 já preparou (qty_separated / order_item_fulfillment_events,
-- confirmação vinda do Bippa):
--   aberto    -> carrinho em montagem (upsell ainda possível)
--   novo      -> finalizado pelo fluxo de checkout, aguardando separação
--   separado  -> Bippa confirmou a separação física dos itens
--   pago      -> só alcançável a partir de separado, quando existir motor
--                de pagamentos de verdade (fora de escopo por ora)
--   cancelado -> inalterado
-- DEFAULT também sai de 'pago' -- não existe mais nenhum caminho no código
-- que deva criar uma linha já paga sem passar por uma confirmação real.
ALTER TABLE orders
  ALTER COLUMN status SET DEFAULT 'novo';

ALTER TABLE orders
  DROP CONSTRAINT orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
    CHECK (status = ANY (ARRAY['aberto', 'aguardando_pagamento', 'novo', 'separado', 'pago', 'cancelado']));
