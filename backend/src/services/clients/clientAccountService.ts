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

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function registration(body: Record<string, unknown>, fallbackEmail?: string): Omit<Client, "id" | "createdAt" | "updatedAt"> {
  return {
    name: text(body.name) ?? "",
    cpfCnpj: text(body.cpfCnpj),
    email: text(body.clientEmail) ?? fallbackEmail,
    cep: text(body.cep),
    street: text(body.street),
    number: text(body.number),
    complement: text(body.complement),
    neighborhood: text(body.neighborhood),
    city: text(body.city),
    state: text(body.state),
    companyResponsible: text(body.companyResponsible),
    storeName: text(body.storeName),
  };
}

export async function createAdministrativeClient(
  tenant: Tenant,
  actor: AuthUser,
  body: Record<string, unknown>,
  context: AuditRequestContext,
): Promise<AuthUser & { cpfCnpj?: string }> {
  if (!isAdministrator(actor)) throw new ForbiddenError();
  const name = text(body.name);
  const email = text(body.email)?.toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!name || !email || !password) throw new ValidationError();
  if (password.length < 6) throw new ValidationError("WEAK_PASSWORD");
  const fields = registration(body, email);
  const result = await withTenantTransaction(tenant, actor, async (client) => {
    const digits = fields.cpfCnpj?.replace(/\D/g, "") ?? "";
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

export async function createClientLogin(
  tenant: Tenant,
  actor: AuthUser,
  clientId: string,
  body: Record<string, unknown>,
  context: AuditRequestContext,
): Promise<{ user: AuthUser }> {
  if (actor.role !== "vendedora" && !isAdministrator(actor)) throw new ForbiddenError();
  const email = text(body.email)?.toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) throw new ValidationError();
  if (password.length < 6) throw new ValidationError("WEAK_PASSWORD");
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
  body: Record<string, unknown>,
): Promise<Client> {
  if (!isAdministrator(actor)) throw new ForbiddenError();
  return withTenantTransaction(tenant, actor, async (client) => {
    const currentRow = await findClientRow(client, clientId);
    if (!currentRow) throw new NotFoundError("CLIENT_NOT_FOUND");
    const current = toClient(currentRow);
    const supplied = registration(body);
    const cpfCnpj = Object.hasOwn(body, "cpfCnpj") ? supplied.cpfCnpj : current.cpfCnpj;
    const digits = cpfCnpj?.replace(/\D/g, "") ?? "";
    if (digits) {
      const duplicate = await findClientRowByDocumentDigits(client, digits);
      if (duplicate && duplicate.id !== clientId) throw new ConflictError("DOCUMENT_TAKEN");
    }
    const updated = await updateClientRow(client, clientId, {
      name: text(body.name) ?? current.name,
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
