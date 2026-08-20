import type { PoolClient } from "pg";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, CartItem, Client, OrderSession } from "@/lib/types";
import { findClientRowByDocumentDigits, insertClientRow, updateClientRow } from "@/models/clientsModel";
import {
  countOpenOrderSessionRowsBySeller,
  insertOrderSessionItemRow,
  insertOrderSessionRow,
} from "@/models/ordersModel";
import { getOrCreateOpenOrder, syncOrderItems } from "@/services/orders/orderItemSync";
import { toOrderSession } from "@/services/orders/orderMapper";
import { findActiveOrderBookRow, insertOrderBookRow } from "@/models/orderBooksModel";
import { listOnlineSellerIds } from "@/models/usersModel";
import { recordAuditEvent, ORDER_SESSION_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { notifySignup } from "@/services/notifications";
import { pickSeller } from "@/services/orders";
import { ConflictError, ValidationError } from "@/services/shared/errors";
import { findStoreSettingsRow } from "@/models/settingsModel";
import { createUserRecord } from "@/services/users/userService";
import { notifySession } from "@/lib/sseHub";
import { issueSession } from "./authenticationService";

interface SignupResult { user: AuthUser; orderSession?: OrderSession }

function requiredText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function createAssignedSession(
  client: PoolClient,
  user: AuthUser,
  registration: Client,
  items: CartItem[],
  context: AuditRequestContext,
): Promise<OrderSession | undefined> {
  const [sellerIds, openCounts, settings] = await Promise.all([
    listOnlineSellerIds(client),
    countOpenOrderSessionRowsBySeller(client),
    findStoreSettingsRow(client),
  ]);
  const sellerId = pickSeller(sellerIds, openCounts, settings?.assignment_strategy ?? undefined);
  if (!sellerId) return undefined;
  const book = (await findActiveOrderBookRow(client, sellerId)) ?? await insertOrderBookRow(client, sellerId, "Atendimentos online");
  const order = await getOrCreateOpenOrder(client, { clientId: registration.id, sellerId, clientName: registration.name, channel: "online" });
  const row = await insertOrderSessionRow(client, {
    orderBookId: book.id,
    orderId: order?.id,
    clientName: registration.name,
    clientId: registration.id,
    sellerId,
    channel: "online",
    status: "aberto",
  });
  for (const item of items) await insertOrderSessionItemRow(client, row.id, item);
  if (order && items.length > 0) {
    await syncOrderItems(client, { orderId: order.id, currentItems: [], nextItems: items, actorId: user.id, actorRole: user.role });
  }
  await updateClientRow(client, registration.id, { ...registration, lastSellerId: sellerId });
  await recordAuditEvent(client, {
    action: ORDER_SESSION_AUDIT_ACTIONS.CREATED,
    entityId: row.id,
    actor: user,
    context,
    metadata: { channel: "online", hasClient: true, itemCount: items.length },
  });
  return toOrderSession(row, items);
}

export async function signupCustomer(
  tenant: Tenant,
  body: Record<string, unknown>,
  context: AuditRequestContext,
): Promise<{ user: AuthUser; token: string }> {
  const fields = {
    name: requiredText(body.name), email: requiredText(body.email).toLowerCase(),
    password: typeof body.password === "string" ? body.password : "",
    cpfCnpj: requiredText(body.cpfCnpj), cep: requiredText(body.cep),
    street: requiredText(body.street), number: requiredText(body.number),
    complement: requiredText(body.complement), neighborhood: requiredText(body.neighborhood),
    city: requiredText(body.city), state: requiredText(body.state),
    companyResponsible: requiredText(body.companyResponsible), storeName: requiredText(body.storeName),
  };
  if (!fields.name || !fields.email || !fields.password || !fields.cpfCnpj || !fields.cep ||
      !fields.street || !fields.number || !fields.neighborhood || !fields.city || !fields.state) {
    throw new ValidationError("INCOMPLETE_SIGNUP");
  }
  if (fields.password.length < 6) throw new ValidationError("WEAK_PASSWORD");
  const items = Array.isArray(body.cart) ? body.cart as CartItem[] : [];
  const result = await withTenantTransaction(tenant, {}, async (client): Promise<SignupResult> => {
    const digits = fields.cpfCnpj.replace(/\D/g, "");
    const storeSettings = await findStoreSettingsRow(client);
    // Ausência da chave preserva o comportamento histórico: CPF e CNPJ.
    if (storeSettings?.features?.allowCpfSignup === false && digits.length !== 14) {
      throw new ValidationError("CNPJ_REQUIRED");
    }
    if (await findClientRowByDocumentDigits(client, digits)) throw new ConflictError("DOCUMENT_TAKEN");
    const row = await insertClientRow(client, {
      name: fields.name, cpfCnpj: fields.cpfCnpj, email: fields.email, cep: fields.cep,
      street: fields.street, number: fields.number, complement: fields.complement || undefined,
      neighborhood: fields.neighborhood, city: fields.city, state: fields.state,
      companyResponsible: fields.companyResponsible || undefined, storeName: fields.storeName || undefined,
    });
    const registration: Client = {
      id: row.id, name: row.name, cpfCnpj: row.cpf_cnpj ?? undefined, email: row.email ?? undefined,
      cep: row.cep ?? undefined, street: row.street ?? undefined, number: row.number ?? undefined,
      complement: row.complement ?? undefined, neighborhood: row.neighborhood ?? undefined,
      city: row.city ?? undefined, state: row.state ?? undefined,
      companyResponsible: row.company_responsible ?? undefined, storeName: row.store_name ?? undefined,
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    };
    const user = await createUserRecord(client, null, context, {
      email: fields.email, password: fields.password, name: fields.name,
      role: "cliente", clientId: registration.id,
    });
    return { user, orderSession: await createAssignedSession(client, user, registration, items, context) };
  });
  if (result.orderSession) notifySession(tenant.id, result.orderSession);
  notifySignup(tenant, result.user);
  return { user: result.user, token: await issueSession(tenant, result.user, context) };
}
