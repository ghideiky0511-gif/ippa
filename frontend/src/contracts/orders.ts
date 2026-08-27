// GERADO a partir de backend/src/contracts — não editar à mão.
// Rode `node scripts/sync-contracts.mjs` (ou `npm run sync-contracts` no
// backend) depois de mudar o arquivo de origem.
import { z } from 'zod';
import { UserRoleSchema } from './auth';
import {
  CartItemSchema,
  EntityIdSchema,
  IsoDateTimeSchema,
  MoneySchema,
  OptionalTextSchema,
  OrderFreightSchema,
  RequiredTextSchema,
  SessionFreightSchema,
} from './shared';

export const OrderChannelSchema = z.enum(['presencial', 'whatsapp', 'online']);
export type OrderChannel = z.infer<typeof OrderChannelSchema>;

// site é o rótulo histórico do frontend de checkout. Ele só é aceito no
// comando por compatibilidade e o serviço o normaliza para online antes de
// persistir; respostas da API continuam usando OrderChannelSchema.
export const CheckoutChannelSchema = z.enum(['presencial', 'whatsapp', 'online', 'site']);
export type CheckoutChannel = z.infer<typeof CheckoutChannelSchema>;

export const OrderSessionParticipantRoleSchema = UserRoleSchema;
export type OrderSessionParticipantRole = z.infer<typeof OrderSessionParticipantRoleSchema>;

export const OrderSessionParticipantUserSchema = z.object({
  id: EntityIdSchema,
  name: RequiredTextSchema,
  role: OrderSessionParticipantRoleSchema,
});
export type OrderSessionParticipantUser = z.infer<typeof OrderSessionParticipantUserSchema>;

// Participação persistida na sessão: identidade e papel são resolvidos
// sempre da conta atual do usuário, sem duplicá-los nesta relação.
export const OrderSessionParticipantSchema = z.object({
  userId: EntityIdSchema,
  firstJoinedAt: IsoDateTimeSchema,
  lastJoinedAt: IsoDateTimeSchema,
  lastLeftAt: IsoDateTimeSchema.optional(),
  joinCount: z.number().int().positive(),
  user: OrderSessionParticipantUserSchema,
});
export type OrderSessionParticipant = z.infer<typeof OrderSessionParticipantSchema>;

// Talão: um pedido em andamento, vinculado a uma vendedora e, opcionalmente,
// a um cadastro de cliente (`clientId`) — sem cadastro ainda, `clientName`
// é só um nome livre (ex. "Sem cliente", ou o nome que a vendedora digitou
// pra lembrar quem é, sem formalizar). Uma vendedora pode ter várias
// sessões abertas ao mesmo tempo (uma por cliente que está atendendo);
// troca entre elas no talão (`TalaoDrawer.tsx`). Reaproveita CartItem — é
// o mesmo formato de "peça no carrinho" que o site público já usa.
export const OrderSessionSchema = z.object({
  id: EntityIdSchema,
  // Pedido atual dentro de um talão. O talão é o agrupador operacional,
  // enquanto esta sessão pertence a uma cliente/atendimento específico.
  orderBookId: EntityIdSchema,
  // Pedido (orders) que este atendimento alimenta -- upsell é isso: um
  // segundo atendimento pra mesma cliente/vendedora anexa nesse mesmo
  // pedido em vez de criar um novo. Ausente só em sessão sem cliente
  // vinculado ("Sem cliente"), que não tem como ser localizada de novo
  // pra receber upsell.
  orderId: EntityIdSchema.optional(),
  clientName: RequiredTextSchema,
  clientId: EntityIdSchema.optional(),
  sellerId: EntityIdSchema,
  // 'online': sessão criada sozinha pelo gatilho de fila quando a cliente se
  // autocadastra — não é presencial nem WhatsApp, ninguém digitou nada pra
  // escolher o canal.
  channel: OrderChannelSchema,
  items: z.array(CartItemSchema),
  // Frete escolhido pela vendedora (ver /frete) — precisa sobreviver até a
  // cliente abrir o link de pagamento, por isso persistido aqui em vez de
  // ficar só no estado transitório que CartProvider usa pra compra direta.
  freight: SessionFreightSchema.optional(),
  // 'aguardando_pagamento': vendedora já montou carrinho + frete e gerou o
  // link (ver paymentToken abaixo) — só falta a cliente pagar. Continua
  // contando como "aberto" no painel do talão, com um badge próprio pra
  // não confundir com pedido ainda em montagem.
  status: z.enum(['aberto', 'fechado', 'aguardando_pagamento', 'cancelado']),
  // Token do link de pagamento ativo — é a própria autenticação desse link
  // (sem exigir login da cliente). Limpo quando a sessão fecha
  // (POST /api/pay/[token]) ou reabre (PUT /api/sessions/[id], status
  // volta pra 'aberto').
  paymentToken: z.string().optional(),
  // Quando o token acima foi gerado — usado pra checar expiração
  // (storeSettings.paymentLinkExpirationMinutes). Limpo junto com
  // paymentToken.
  paymentTokenCreatedAt: IsoDateTimeSchema.optional(),
  notes: z.string().optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  // Nome da vendedora — NÃO persistido, computado só na resposta de
  // GET /api/sessions/mine pro indicador de presença na tela da cliente
  // (PresenceBadge.tsx). Ausente em qualquer outro lugar que devolve
  // OrderSession (talão da vendedora não precisa disso, ela já sabe quem é).
  sellerName: z.string().optional(),
});
export type OrderSession = z.infer<typeof OrderSessionSchema>;

export const OrderSessionStatusSchema = OrderSessionSchema.shape.status;
export type OrderSessionStatus = z.infer<typeof OrderSessionStatusSchema>;

export const OrderBookSchema = z.object({
  id: EntityIdSchema,
  sellerId: EntityIdSchema,
  name: RequiredTextSchema,
  status: z.enum(['aberto', 'fechado']),
  isActive: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type OrderBook = z.infer<typeof OrderBookSchema>;

export const OrderStatusSchema = z.enum(['aberto', 'aguardando_pagamento', 'novo', 'separado', 'pago', 'cancelado']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderSchema = z.object({
  id: EntityIdSchema,
  // Identificador legível pela pessoa usuária. É atribuído pelo banco na
  // criação e é sequencial dentro de cada tenant; o UUID acima continua
  // sendo a chave técnica usada nas relações e rotas internas.
  orderNumber: z.number().int().positive(),
  date: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema.optional(),
  // 'aberto': carrinho ainda em montagem, pode ganhar upsell (mais itens,
  // de um atendimento novo da mesma vendedora ou de um checkout seguinte
  // da própria cliente) — ver orderId em OrderSession. 'novo': checkout
  // concluído (talão, link de pagamento ou checkout da cliente), aguardando
  // separação física — nenhum desses fluxos processa pagamento de verdade
  // hoje, então nenhum pedido nasce "pago" mais. 'separado': Bippa confirmou
  // a separação física (ver order_item_fulfillment_events, migration 023).
  // 'pago': só alcançável a partir de 'separado', quando existir motor de
  // pagamentos de verdade (fora de escopo por ora).
  status: OrderStatusSchema,
  items: z.array(CartItemSchema),
  total: MoneySchema, // já líquido de desconto
  channel: OrderChannelSchema,
  freight: OrderFreightSchema.optional(),
  paymentMethod: z.string().optional(),
  discount: z.object({ label: RequiredTextSchema, amount: MoneySchema }).optional(), // snapshot do desconto aplicado no momento da compra, pra "Meus pedidos" mostrar mesmo se a regra mudar depois
  // Presentes só nos pedidos gravados no servidor, não nos antigos/locais
  // salvos só no localStorage do navegador (ver readOrders em
  // CartProvider.tsx). clientId: autocompra da cliente logada OU pedido de
  // talão fechado via link de pagamento (nesse segundo caso sellerId
  // também vem preenchido — a vendedora que montou o pedido).
  clientId: EntityIdSchema.optional(),
  sellerId: EntityIdSchema.optional(),
  // Snapshot do nome da cliente no momento do pedido — só usado pra
  // "Minhas vendas" da vendedora, que lista vendas de clientes diferentes
  // e precisa saber de quem é cada uma; a própria "Meus pedidos" da
  // cliente não precisa disso (já é sempre ela).
  clientName: z.string().optional(),
});
export type Order = z.infer<typeof OrderSchema>;

export const CreateOrderSessionInputSchema = z.object({
  items: z.array(CartItemSchema).optional(),
  orderBookId: EntityIdSchema.optional(),
  clientId: EntityIdSchema.optional(),
  clientName: OptionalTextSchema,
  channel: OrderChannelSchema.optional(),
  notes: OptionalTextSchema,
});
export type CreateOrderSessionInput = z.infer<typeof CreateOrderSessionInputSchema>;

export const UpdateOrderSessionInputSchema = z.object({
  clientId: EntityIdSchema.optional(),
  notes: OptionalTextSchema,
  status: OrderSessionStatusSchema.optional(),
  items: z.array(CartItemSchema).optional(),
});
export type UpdateOrderSessionInput = z.infer<typeof UpdateOrderSessionInputSchema>;

export const CreateOrderBookInputSchema = z.object({
  name: OptionalTextSchema,
});
export type CreateOrderBookInput = z.infer<typeof CreateOrderBookInputSchema>;

// O snapshot de itens ainda é aceito porque pagamento é mockado (payload
// completo, não só variantId+qty). Frete já não é mais um snapshot livre --
// o cliente escolhe um `freight_providers` ativo e o backend calcula
// preço/label/prazo a partir da config do provider (ver
// orderService.createCustomerOrder).
export const CreateCustomerOrderInputSchema = z.object({
  items: z.array(CartItemSchema),
  total: MoneySchema,
  channel: CheckoutChannelSchema.optional(),
  sessionId: EntityIdSchema.optional(),
  freightProviderId: EntityIdSchema,
  paymentMethod: OptionalTextSchema,
  discount: z.object({ label: RequiredTextSchema, amount: MoneySchema }).optional(),
});
export type CreateCustomerOrderInput = z.infer<typeof CreateCustomerOrderInputSchema>;
