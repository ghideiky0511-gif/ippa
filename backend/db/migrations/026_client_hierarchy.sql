-- Cliente master (conta que compra por si e por várias filiais de uma vez)
-- + filiais — hierarquia de 1 nível só (sem correntes). Vínculo manual por
-- enquanto; a importação do TOTVS ("Coligador", ver LegalEntityDataModel)
-- vai poder preencher a mesma coluna depois.
ALTER TABLE clients ADD COLUMN parent_client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX clients_parent_client_id_idx ON clients (tenant_id, parent_client_id) WHERE parent_client_id IS NOT NULL;
