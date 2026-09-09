-- order.seller_changed foi adicionado a ORDER_AUDIT_ACTIONS (orderAuditActions.ts)
-- junto de orderService.reassignOrderSeller, mas o enum audit_action só
-- conhecia os valores criados nas migrations anteriores. Sem isso, registrar
-- o evento de auditoria após reatribuir a vendedora do pedido falha com
-- `invalid input value for enum audit_action: "order.seller_changed"`
-- (code 22P02), mesmo com o pedido já atualizado com sucesso.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'order.seller_changed';
