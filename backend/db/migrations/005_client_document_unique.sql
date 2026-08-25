ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_tenant_id_cpf_cnpj_key;
ALTER TABLE clients ADD CONSTRAINT clients_tenant_document_unique UNIQUE NULLS DISTINCT (tenant_id, cpf_cnpj);
