-- Duas ações manuais novas na tela de detalhe do pedido (ver FAB de
-- ferramentas do pedido): marcar como pago (sem gateway real, ver migration
-- 036 -- é só um registro administrativo, "fora do sistema") e cancelar
-- pedido (com tentativa de cancelamento no ERP se já enviado).

-- audit_action e audit_entity_type são enums (migration 004) -- o valor
-- novo precisa existir antes que recordAuditEvent grave order.* / o novo
-- provider_order.cancel_requested.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'order.manually_marked_paid';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'order.manually_cancelled';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'provider_order.cancel_requested';
ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'order';

-- Novo estado terminal: cancelamento de pedido cancela no ERP (se já
-- enviado) sem recriar em seguida -- diferente de 'cancelling' (migration
-- 029), que sempre cancela E reenvia na mesma tentativa (ver
-- orderPushService.attemptProviderOrderPush). Reusar 'cancelling' aqui
-- reenviaria por engano um pedido que o operador acabou de cancelar.
ALTER TABLE provider_orders DROP CONSTRAINT provider_orders_status_check;
ALTER TABLE provider_orders ADD CONSTRAINT provider_orders_status_check
  CHECK (status IN ('pending', 'processing', 'cancelling', 'sent', 'failed', 'cancelled'));
