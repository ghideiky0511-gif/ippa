-- Os fluxos de edição manual e resincronização do ERP atualizam
-- variantes existentes e precisam registrar quando o snapshot mudou.
-- A tabela original de product_variants não recebeu essa coluna junto com
-- products, embora os models já a utilizem.
ALTER TABLE product_variants
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
