-- Telefone WhatsApp da vendedora -- mesmo padrão de clients.whatsapp_phone
-- (migration 055): formato E.164 (+5511999999999), conversão pro formato
-- sem "+" que a Cloud API espera fica no payload builder, não no banco.
-- Coluna direto em `users` (não tabela separada): confirmado com o usuário
-- que cada vendedora tem no máximo 1 telefone.

ALTER TABLE users ADD COLUMN whatsapp_phone text;

ALTER TABLE users ADD CONSTRAINT users_whatsapp_phone_format
  CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$');

CREATE INDEX users_whatsapp_phone_idx
  ON users (tenant_id, whatsapp_phone) WHERE whatsapp_phone IS NOT NULL;
