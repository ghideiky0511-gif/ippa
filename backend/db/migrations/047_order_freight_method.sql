-- Tipo de frete específico do pedido (Transportadora/Correios/Excursão/Loja
-- vizinha/Retirada local/Motoboy/Entrega própria) -- vocabulário mais
-- granular que freight_provider_kind (pickup/fixed/carrier, migration 043),
-- que continua existindo pra categorizar o comportamento do provider.
-- `method` é só um rótulo operacional escolhido por quem atende, editável
-- depois do pedido fechado (ver updateOrderFreightMethod em orderService.ts)
-- -- por isso fica solto de freight_providers, não uma linha configurável
-- por tenant.
CREATE TYPE order_freight_method AS ENUM (
  'transportadora', 'correios', 'excursao', 'loja_vizinha', 'retirada_local', 'motoboy', 'entrega_propria'
);

-- Nullable: pedidos existentes (e frete criado antes desta coluna existir)
-- ficam sem valor -- sem backfill forçado, já que não há como inferir o
-- método a partir do kind/label livre gravados até aqui.
ALTER TABLE order_freights ADD COLUMN method order_freight_method;
