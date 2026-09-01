// GERADO a partir de backend/src/contracts — não editar à mão.
// Rode `node scripts/sync-contracts.mjs` (ou `npm run sync-contracts` no
// backend) depois de mudar o arquivo de origem.
import { z } from 'zod';
import { EntityIdSchema, IsoDateTimeSchema, MoneySchema } from './shared';

export const PaymentChargeStatusSchema = z.enum([
  'pending', 'processing', 'authorized', 'paid', 'failed', 'expired', 'cancelled',
]);
export type PaymentChargeStatus = z.infer<typeof PaymentChargeStatusSchema>;

export const PaymentChargeMethodSchema = z.enum(['pix', 'boleto', 'cartao']);
export type PaymentChargeMethod = z.infer<typeof PaymentChargeMethodSchema>;

// Formato provider-agnóstico: qualquer gateway (Stripe hoje, outro amanhã --
// ver payments/registry.ts) preenche este mesmo shape. A UI que exibe uma
// cobrança (OrderPaymentDetails.tsx, reusada entre o workspace e a tela da
// cliente) nunca sabe qual provider gerou o dado, só lê este contrato.
export const OrderPaymentChargeCardSchema = z.object({
  lastDigits: z.string().optional(),
  brand: z.string().optional(),
  // 1 = à vista. Providers que não relatam parcelamento (ou cobranças sem
  // parcelamento configurado) caem no default -- nunca fica ausente, pra UI
  // não precisar tratar "sem dado" como um terceiro estado.
  installments: z.number().int().positive(),
  // Identificador único da transação do lado da bandeira/adquirente
  // (equivalente ao NSU de um comprovante de cartão brasileiro) -- ausente
  // quando o provider não expõe esse dado ou a cobrança nunca chegou a ser
  // autorizada.
  nsu: z.string().optional(),
});
export type OrderPaymentChargeCard = z.infer<typeof OrderPaymentChargeCardSchema>;

export const OrderPaymentChargeSchema = z.object({
  id: EntityIdSchema,
  provider: z.string(),
  method: PaymentChargeMethodSchema,
  status: PaymentChargeStatusSchema,
  amount: MoneySchema,
  createdAt: IsoDateTimeSchema,
  paidAt: IsoDateTimeSchema.nullable().optional(),
  failureReason: z.string().optional(),
  // Só preenchido para method === 'cartao' -- pix/boleto ainda não têm
  // gateway real (ver payments/types.ts, ChargeResult é união por método),
  // mas o campo já nasce opcional pra não exigir mudança de shape depois.
  card: OrderPaymentChargeCardSchema.optional(),
});
export type OrderPaymentCharge = z.infer<typeof OrderPaymentChargeSchema>;
