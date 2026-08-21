// GERADO a partir de backend/src/contracts — não editar à mão.
// Rode `node scripts/sync-contracts.mjs` (ou `npm run sync-contracts` no
// backend) depois de mudar o arquivo de origem.
import { z } from 'zod';
import { ClientProfileInputSchema } from './clients';
import {
  CartItemSchema,
  CepSchema,
  CpfCnpjSchema,
  EmailSchema,
  EntityIdSchema,
  OptionalEmailSchema,
  RequiredTextSchema,
} from './shared';

export const CatalogAreaSchema = z.enum(['talao', 'pedidos']);
export type CatalogArea = z.infer<typeof CatalogAreaSchema>;
export const DEFAULT_SELLER_CATALOG_AREAS = ['talao', 'pedidos'] as const satisfies readonly CatalogArea[];

export const UserRoleSchema = z.enum([
  'administrador',
  'vendedora',
  'expedicao',
  'entregador',
  'cliente',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PasswordSchema = z.string().min(6, 'A senha deve ter ao menos 6 caracteres.');

export const AuthPermissionsSchema = z.object({
  adminAccess: z.boolean().optional(),
  catalogAreas: z.array(CatalogAreaSchema).optional(),
});
export type AuthPermissions = z.infer<typeof AuthPermissionsSchema>;

export const AuthUserSchema = z.object({
  id: EntityIdSchema,
  email: EmailSchema,
  name: RequiredTextSchema,
  role: UserRoleSchema,
  avatarUrl: z.string().url().optional(),
  clientId: EntityIdSchema.optional(),
  permissions: AuthPermissionsSchema.optional(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

// Credenciais reutilizadas na criação e edição de contas. O schema também
// normaliza o e-mail antes que ele atravesse a fronteira da API.
export const UserCredentialsSchema = z.object({
  name: RequiredTextSchema,
  email: EmailSchema,
  password: PasswordSchema.optional(),
  catalogAreas: z.array(CatalogAreaSchema).optional(),
});
export type UserCredentials = z.infer<typeof UserCredentialsSchema>;

export const CreateUserCredentialsSchema = UserCredentialsSchema.extend({
  password: PasswordSchema,
});

export const CreateTenantUserInputSchema = CreateUserCredentialsSchema.extend({
  role: UserRoleSchema.optional(),
});
export type CreateTenantUserInput = z.infer<typeof CreateTenantUserInputSchema>;

export const UpdateTenantUserInputSchema = z.object({
  name: RequiredTextSchema.optional(),
  email: OptionalEmailSchema,
  password: PasswordSchema.optional(),
  catalogAreas: z.array(CatalogAreaSchema).optional(),
});
export type UpdateTenantUserInput = z.infer<typeof UpdateTenantUserInputSchema>;

const ClientRegistrationProfileSchema = ClientProfileInputSchema
  .omit({ name: true, email: true })
  .extend({ clientEmail: OptionalEmailSchema });

// Cadastro administrativo de cliente: uma conta de acesso mais os dados do
// cadastro comercial da cliente. `email` é o login; `clientEmail` é o
// contato e pode ficar vazio quando for igual ao login.
export const ClientRegistrationSchema = CreateUserCredentialsSchema.extend(
  ClientRegistrationProfileSchema.shape,
);
export type ClientRegistration = z.infer<typeof ClientRegistrationSchema>;

// A edição do cadastro comercial não altera as credenciais da conta. Login e
// senha continuam no endpoint próprio de usuários.
export const ClientRegistrationUpdateSchema = ClientRegistrationProfileSchema.extend({
  name: RequiredTextSchema,
}).partial();
export type ClientRegistrationUpdate = z.infer<typeof ClientRegistrationUpdateSchema>;

export const CustomerSignupSchema = ClientProfileInputSchema.extend({
  email: EmailSchema,
  password: PasswordSchema,
  cpfCnpj: CpfCnpjSchema,
  cep: CepSchema,
  street: RequiredTextSchema,
  number: RequiredTextSchema,
  neighborhood: RequiredTextSchema,
  city: RequiredTextSchema,
  state: RequiredTextSchema,
  cart: z.array(CartItemSchema).optional(),
});
export type CustomerSignup = z.infer<typeof CustomerSignupSchema>;

// Resposta administrativa: a conta autenticável somada aos dados comerciais
// quando o papel é cliente. Mantém estes campos opcionais para vendedores.
export const AdminUserSchema = AuthUserSchema.extend({
  cpfCnpj: z.string().optional(),
  clientEmail: OptionalEmailSchema,
  cep: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  companyResponsible: z.string().optional(),
  storeName: z.string().optional(),
  lastSellerId: EntityIdSchema.optional(),
  createdAt: z.iso.datetime().optional(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;
