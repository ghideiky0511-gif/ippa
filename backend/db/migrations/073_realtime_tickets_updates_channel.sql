-- O ticket do namespace /atualizacoes (e o da cliente que entra em /pedidos
-- ainda sem pedido) vivia num Map em memória do processo
-- (services/realtime/ticketService.ts). Com mais de uma Machine no ar isso
-- quebra: a requisição HTTP que minera o ticket e o handshake do WebSocket que
-- o consome são conexões separadas, roteadas de forma independente pelo proxy
-- do Fly — metade das vezes o handshake caía numa Machine que nunca viu aquele
-- token e era recusado com "Ticket inválido ou expirado.".
--
-- Os dois tipos de ticket passam a morar aqui. O de atualizações não tem
-- pedido associado, por isso order_session_id vira opcional: NULL = ticket de
-- atualizações, preenchido = ticket de sessão (os consumos filtram pelo tipo,
-- ver models/realtimeTicketsModel.ts).
ALTER TABLE realtime_tickets ALTER COLUMN order_session_id DROP NOT NULL;

-- Cada conexão/reconexão de socket minera um ticket, e antes nada apagava os
-- vencidos. O mint agora limpa os tickets vencidos do próprio usuário na
-- mesma transação — este índice é o que mantém esse DELETE barato.
CREATE INDEX IF NOT EXISTS realtime_tickets_user_expires_idx
  ON realtime_tickets (tenant_id, user_id, expires_at);
