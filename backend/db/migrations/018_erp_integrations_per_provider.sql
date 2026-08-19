-- Desacopla "salvar credenciais de um provider" de "ativar esse provider":
-- antes, cada salvamento inseria uma linha nova e desativava a anterior
-- (upsertActiveErpIntegrationRow), então nunca havia mais de uma linha por
-- (tenant_id, provider) *viva* ao mesmo tempo, mas trocar de provider e
-- voltar perdia o integration_id antigo — e com ele a reconciliação em
-- erp_external_references (produtos/pedidos/clientes/empresas já
-- sincronizados voltavam a ser tratados como novos). Agora cada
-- (tenant_id, provider) tem uma única linha estável, atualizada in-place;
-- só uma pode estar active por vez (mantém o índice parcial já existente).

-- Dedup defensivo antes da constraint nova: mantém, por (tenant_id,
-- provider), a linha ativa se houver, senão a mais recentemente
-- atualizada; remove as demais. Efeito cascata em erp_external_references
-- para as linhas descartadas é aceitável — mesma categoria de tradeoff já
-- documentada para credenciais em texto claro nesta tabela.
DELETE FROM tenant_erp_integrations t
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, provider
           ORDER BY active DESC, updated_at DESC
         ) AS rn
  FROM tenant_erp_integrations
) dedup
WHERE t.id = dedup.id AND dedup.rn > 1;

ALTER TABLE tenant_erp_integrations
  ADD CONSTRAINT tenant_erp_integrations_tenant_provider_key UNIQUE (tenant_id, provider);

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'erp_integration.activated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'erp_integration.deactivated';
