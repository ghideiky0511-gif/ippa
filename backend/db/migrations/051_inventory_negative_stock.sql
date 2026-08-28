-- O ERP (qualquer provider, não só TOTVS Moda) pode reportar saldo negativo
-- por erro de estoque do lado dele (venda além do saldo, ajuste manual
-- incorreto etc.). Até aqui applyErpInventorySnapshotRow zerava esse valor
-- (Math.max(0, ...)) antes de gravar, escondendo o problema real do usuário
-- na grade de variantes. Passamos a gravar o valor tal como o ERP mandou,
-- então on_hand_qty >= 0 precisa cair. reserved_qty continua sem poder ser
-- negativo nem exceder o estoque disponível de verdade (nunca abaixo de 0).
ALTER TABLE inventory_balances DROP CONSTRAINT inventory_balances_on_hand_qty_check;
ALTER TABLE inventory_balances DROP CONSTRAINT inventory_balances_check;
ALTER TABLE inventory_balances
  ADD CONSTRAINT inventory_balances_reserved_qty_check
  CHECK (reserved_qty >= 0 AND reserved_qty <= GREATEST(on_hand_qty, 0));
