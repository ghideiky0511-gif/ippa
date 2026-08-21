// GERADO a partir de backend/src/contracts — não editar à mão.
// Rode `node scripts/sync-contracts.mjs` (ou `npm run sync-contracts` no
// backend) depois de mudar o arquivo de origem.
import { z } from 'zod';

export const EntityIdSchema = z.string().trim().min(1, 'Identificador obrigatório.');

export const RequiredTextSchema = z.string().trim().min(1, 'Campo obrigatório.');

// Campos opcionais enviados por formulários HTML chegam como string vazia.
// Normalizá-los aqui evita que cada serviço repita trim + fallback.
export const OptionalTextSchema = z.preprocess(
  (value) => typeof value === 'string' && !value.trim() ? undefined : value,
  z.string().trim().min(1, 'Campo inválido.').optional(),
);

export const MoneySchema = z.number().finite().nonnegative('O valor não pode ser negativo.');
export const PositiveIntegerSchema = z.number().int().positive('Informe um número inteiro positivo.');
export const NonNegativeIntegerSchema = z.number().int().nonnegative('Informe um número inteiro não negativo.');
export const IsoDateTimeSchema = z.iso.datetime();

// Valor normalizado e reutilizável para todos os e-mails que entram no
// domínio. A transformação garante que comparações e índices de unicidade
// trabalhem sempre com o mesmo formato.
export const EmailSchema = z.string()
  .trim()
  .toLowerCase()
  .email('Informe um e-mail válido.');

// Formulários HTML enviam string vazia para campos opcionais. Convertemos
// esse caso para undefined antes de validar o e-mail, sem aceitar texto
// inválido quando o campo foi de fato preenchido.
export const OptionalEmailSchema = z.preprocess(
  (value) => typeof value === 'string' && !value.trim() ? undefined : value,
  EmailSchema.optional(),
);

export function documentDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export const CpfCnpjSchema = z.string()
  .transform(documentDigits)
  .refine((value) => value.length === 11 || value.length === 14, {
    message: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.',
  });

export const OptionalCpfCnpjSchema = z.preprocess(
  (value) => typeof value === 'string' && !value.trim() ? undefined : value,
  CpfCnpjSchema.optional(),
);

export type DocumentType = 'cpf' | 'cnpj' | null;

export function getDocumentType(cpfCnpj: string): DocumentType {
  const digits = documentDigits(cpfCnpj);
  if (digits.length === 11) return 'cpf';
  if (digits.length === 14) return 'cnpj';
  return null;
}

export const CepSchema = z.string()
  .transform(documentDigits)
  .refine((value) => value.length === 8, { message: 'Informe um CEP com 8 dígitos.' });

export const OptionalCepSchema = z.preprocess(
  (value) => typeof value === 'string' && !value.trim() ? undefined : value,
  CepSchema.optional(),
);

export const HttpUrlSchema = z.string().url('Informe uma URL válida.').refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Informe uma URL HTTP ou HTTPS válida.');

export const CartItemSchema = z.object({
  key: EntityIdSchema,
  id: EntityIdSchema,
  name: RequiredTextSchema,
  image: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  price: MoneySchema,
  qty: NonNegativeIntegerSchema,
  // Snapshot do estoque da variante no momento em que foi adicionada ao
  // carrinho (não recalcula depois — se o estoque mudar, a peça já
  // escolhida não deve "sumir" a previsão combinada). Sem valor = sem
  // controle de estoque, qty inteira é "pronta entrega" (hoje).
  stockQty: NonNegativeIntegerSchema.optional(),
  // Previsão de entrega escolhida pra a parte da qty que excede stockQty
  // (rótulo livre, ex. "Em 30 dias" — vem de CONFIG.backorderDeliveryOptions,
  // que é por loja). Sem valor = ainda não escolhida. Rótulo livre, não é
  // data — não usa z.iso.datetime() de propósito.
  backorderDate: z.string().optional(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

export const ShippingOptionSchema = z.object({
  id: EntityIdSchema,
  label: RequiredTextSchema,
  price: MoneySchema,
  prazo: RequiredTextSchema,
});
export type ShippingOption = z.infer<typeof ShippingOptionSchema>;
