-- Nova ação manual "Confirmar separação" na tela de pedido (ver FAB de
-- ferramentas do pedido, mesmo padrão de order.manually_marked_paid/
-- order.manually_cancelled na migration 038) -- pré-requisito obrigatório
-- pra createOrderCharge aceitar cobrar o pedido (assertOrderChargeable em
-- paymentChargeService.ts), já que nenhuma integração de fulfillment
-- escreve qty_separated automaticamente ainda.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'order.items_separated';
