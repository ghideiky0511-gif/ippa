-- Cache do token de acesso do provider de ERP, persistido por integração
-- (hoje só o TOTVS Moda autentica -- ver providers/totvsmoda/client.ts).
-- Sem isto, cada createErpProvider (erp/registry, fábrica pura, sem estado
-- entre chamadas) cria um TotvsModaClient novo e reautentica do zero, mesmo
-- dentro da janela de validade do token anterior -- toda operação (catalog
-- sync, push de pedido, checagem de estoque) batia o endpoint authenticate
-- de novo. Texto claro, mesmo tradeoff já aceito para `credentials` nesta
-- tabela (ver migration 011).
ALTER TABLE tenant_erp_integrations
  ADD COLUMN cached_access_token text,
  ADD COLUMN cached_access_token_expires_at timestamptz;
