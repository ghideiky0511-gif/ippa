import { z } from "zod";
import {
  ClientRegistrationSchema,
  ClientRegistrationUpdateSchema,
  PasswordSchema,
} from "@/contracts/auth";
import { documentDigits, EmailSchema } from "@/contracts/shared";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Client } from "@/lib/types";
import { findClientRow, findClientRowByDocumentDigits, insertClientRow } from "@/models/clientsModel";
import { findUserRowByClientId } from "@/models/usersModel";
import type { AuditRequestContext } from "@/services/audit";
import { notifySignup } from "@/services/notifications";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { createUserRecord, isAdministrator } from "@/services/users/userService";
import { toClient } from "./clientMapper";

// Campos comerciais usam clientEmail para não confundir contato com o e-mail
// de login. O contrato já normaliza textos, documento e e-mail.
function registration(body: z.infer<typeof ClientRegistrationUpdateSchema>, fallbackEmail?: string): Omit<Client, "id" | "createdAt" | "updatedAt"> {
  return {
    name: body.name ?? "",
    cpfCnpj: body.cpfCnpj,
    email: body.clientEmail ?? fallbackEmail,
    cep: body.cep,
    street: body.street,
    number: body.number,
    complement: body.complement,
    neighborhood: body.neighborhood,
    city: body.city,
    state: body.state,
    companyResponsible: body.companyResponsible,
    storeName: body.storeName,
  };
}

const CreateAdministrativeClientSchema = ClientRegistrationSchema;

export async function createAdministrativeClient(
  tenant: Tenant,
  actor: AuthUser,
  body: unknown,
  context: AuditRequestContext,
): Promise<AuthUser & { cpfCnpj?: string }> {
  if (!isAdministrator(actor)) throw new ForbiddenError();
  const parsed = CreateAdministrativeClientSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
  const data = parsed.data;
  const name = data.name;
  const email = data.email;
  const password = data.password;
  const fields = registration(data, email);
  if (!fields.cpfCnpj?.trim() || !fields.cep?.trim()) throw new ValidationError("INCOMPLETE_CLIENT");
  const result = await withTenantTransaction(tenant, actor, async (client) => {
    const digits = fields.cpfCnpj ? documentDigits(fields.cpfCnpj) : "";
    if (digits && await findClientRowByDocumentDigits(client, digits)) throw new ConflictError("DOCUMENT_TAKEN");
    const createdClient = toClient(await insertClientRow(client, { ...fields, name }));
    const user = await createUserRecord(client, actor, context, {
      email, name, password, role: "cliente", clientId: createdClient.id,
    });
    return { ...user, cpfCnpj: createdClient.cpfCnpj };
  });
  notifySignup(tenant, result);
  return result;
}

const ClientLoginSchema = z.object({ email: EmailSchema, password: PasswordSchema });

export async function createClientLogin(
  tenant: Tenant,
  actor: AuthUser,
  clientId: string,
  body: unknown,
  context: AuditRequestContext,
): Promise<{ user: AuthUser }> {
  if (actor.role !== "vendedora" && !isAdministrator(actor)) throw new ForbiddenError();
  const parsed = ClientLoginSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
  const email = parsed.data.email;
  const password = parsed.data.password;
  const user = await withTenantTransaction(tenant, actor, async (client) => {
    const clientRow = await findClientRow(client, clientId);
    if (!clientRow) throw new NotFoundError("CLIENT_NOT_FOUND");
    if (!clientRow.name.trim() || !clientRow.cpf_cnpj?.trim() || !clientRow.email?.trim() || !clientRow.cep?.trim()) {
      throw new ValidationError("INCOMPLETE_CLIENT");
    }
    if (await findUserRowByClientId(client, clientId)) throw new ConflictError("CLIENT_ALREADY_HAS_LOGIN");
    return createUserRecord(client, actor, context, {
      email, password, name: clientRow.name, role: "cliente", clientId,
    });
  });
  notifySignup(tenant, user);
  return { user };
}

// Removida: updateAdministrativeClient permitia a um administrador editar
// CPF/CNPJ e e-mail de um cadastro de cliente sem nenhuma trava — uma segunda
// porta de entrada pro mesmo Client, com regras diferentes da usada em
// /workspace/clientes (updateTenantClient, clientService.ts). O modal de
// edição de cliente em /workspace/usuarios agora chama esse mesmo endpoint
// travado (ver UserFormModal.tsx / usersClient.ts), então essa função e a
// rota PUT /api/admin/clients/[id] foram removidas — uma regra só, um único
// caminho de edição.
