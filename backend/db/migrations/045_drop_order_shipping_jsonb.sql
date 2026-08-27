-- O código (models/services/contratos) já foi cortado para ler/escrever
-- freight_providers/freight_quotes/order_freights e as 6 colunas de frete de
-- order_sessions (ver migration 043) em vez destas duas colunas jsonb --
-- nenhum caminho de leitura ou escrita depende mais delas.
ALTER TABLE order_sessions DROP COLUMN shipping;
ALTER TABLE orders DROP COLUMN shipping;
