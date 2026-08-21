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
import { findClientRow, findClientRowByDocumentDigits, insertClientRow, updateClientRow } from "@/models/clientsModel";
import { findUserRowByClientId } from "@/models/usersModel";
import type { AuditRequestContext } from "@/services/audit";
import { notifySignup } from "@/services/notifications";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { createUserRecord, isAdministrator } from "@/services/users/userService";
import { toClient } from "./clientMapper";

// Campos comerciais usam clientEmail para não confundir contato com o e-mail
// de login. O contrato já normaliza textos, documento e e-mail.
const ClientRegistrationFieldsSchema = ClientRegistrationUpdateSchema;

function registration(body: z.infer<typeof ClientRegistrationFieldsSchema>, fallbackEmail?: string): Omit<Client, "id" | "createdAt" | "updatedAt"> {
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
    if (await findUserRowByClientId(client, clientId)) throw new ConflictError("CLIENT_ALREADY_HAS_LOGIN");
    return createUserRecord(client, actor, context, {
      email, password, name: clientRow.name, role: "cliente", clientId,
    });
  });
  notifySignup(tenant, user);
  return { user };
}

export async function updateAdministrativeClient(
  tenant: Tenant,
  actor: AuthUser,
  clientId: string,
  rawBody: unknown,
): Promise<Client> {
  if (!isAdministrator(actor)) throw new ForbiddenError();
  const parsed = ClientRegistrationFieldsSchema.safeParse(rawBody);
  if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
  const body = parsed.data;
  return withTenantTransaction(tenant, actor, async (client) => {
    const currentRow = await findClientRow(client, clientId);
    if (!currentRow) throw new NotFoundError("CLIENT_NOT_FOUND");
    const current = toClient(currentRow);
    const supplied = registration(body);
    const cpfCnpj = Object.hasOwn(body, "cpfCnpj") ? supplied.cpfCnpj : current.cpfCnpj;
    const digits = cpfCnpj ? documentDigits(cpfCnpj) : "";
    if (digits) {
      const duplicate = await findClientRowByDocumentDigits(client, digits);
      if (duplicate && duplicate.id !== clientId) throw new ConflictError("DOCUMENT_TAKEN");
    }
    const updated = await updateClientRow(client, clientId, {
      name: body.name ?? current.name,
      cpfCnpj,
      email: Object.hasOwn(body, "clientEmail") ? supplied.email : current.email,
      cep: Object.hasOwn(body, "cep") ? supplied.cep : current.cep,
      street: Object.hasOwn(body, "street") ? supplied.street : current.street,
      number: Object.hasOwn(body, "number") ? supplied.number : current.number,
      complement: Object.hasOwn(body, "complement") ? supplied.complement : current.complement,
      neighborhood: Object.hasOwn(body, "neighborhood") ? supplied.neighborhood : current.neighborhood,
      city: Object.hasOwn(body, "city") ? supplied.city : current.city,
      state: Object.hasOwn(body, "state") ? supplied.state : current.state,
      companyResponsible: Object.hasOwn(body, "companyResponsible") ? supplied.companyResponsible : current.companyResponsible,
      storeName: Object.hasOwn(body, "storeName") ? supplied.storeName : current.storeName,
      lastSellerId: current.lastSellerId,
    });
    if (!updated) throw new NotFoundError("CLIENT_NOT_FOUND");
    return toClient(updated);
  });
}
