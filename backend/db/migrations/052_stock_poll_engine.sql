-- Poll de saldo dedicado, separado do motor de sync de catálogo
-- (catalog_sync_configs/states já existentes, migration 039): descoberta
-- diferente (balances/search por changeDate, não o feed de produto) e
-- cadência bem mais rápida. Lease própria pra um full sync de catálogo
-- longo nunca travar o poll de saldo, nem vice-versa.

ALTER TABLE catalog_sync_configs
  ADD COLUMN stock_poll_interval_seconds integer NOT NULL DEFAULT 60
    CHECK (stock_poll_interval_seconds BETWEEN 15 AND 3600);

ALTER TABLE catalog_sync_states
  ADD COLUMN stock_checkpoint_at timestamptz,
  ADD COLUMN next_stock_poll_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN stock_lease_token uuid,
  ADD COLUMN stock_lease_until timestamptz;
