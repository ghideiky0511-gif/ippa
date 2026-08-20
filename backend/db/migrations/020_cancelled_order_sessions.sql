-- Cancelamento preserva a sessao e seus itens para consulta e eventual
-- reativacao; nao representa um pedido financeiro finalizado.
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'cancelado';
