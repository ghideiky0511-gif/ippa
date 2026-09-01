-- Telefone/WhatsApp da cliente -- não existia nenhum campo de contato por
-- telefone em `clients` até aqui. Formato E.164 (+5511999999999); a
-- conversão pro formato sem "+" que a Cloud API do WhatsApp espera em `to`
-- fica no payload builder da aplicação, não no banco.

ALTER TABLE clients ADD COLUMN whatsapp_phone text;

ALTER TABLE clients ADD CONSTRAINT clients_whatsapp_phone_format
  CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$');

CREATE INDEX clients_whatsapp_phone_idx
  ON clients (tenant_id, whatsapp_phone) WHERE whatsapp_phone IS NOT NULL;
