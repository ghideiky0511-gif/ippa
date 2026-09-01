import { createHash, randomBytes } from "node:crypto";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, OrderSession } from "@/lib/types";
import { findClientRow } from "@/models/clientsModel";
import { findOrderSessionRow, listOrderSessionItemRowsBySession, setOrderSessionPaymentTokenRow } from "@/models/ordersModel";
import { findUserRowByClientId } from "@/models/usersModel";
import { notifyPaymentLink } from "@/services/notifications";
import { sendPaymentLinkWhatsApp, toWhatsAppOrderRecipient } from "@/services/whatsapp";
import { notifySession } from "@/services/realtime/updateBroadcast";
import { scheduleSessionBroadcast } from "@/services/realtime/sessionBroadcast";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { toOrderSession } from "./orderMapper";
import { canManageSession } from "./orderSessionService";

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPaymentLink(
  tenant: Tenant,
  actor: AuthUser,
  sessionId: string,
  publicOrigin: string,
): Promise<{ token: string }> {
  if (actor.role === "cliente") throw new ForbiddenError();
  const token = randomBytes(24).toString("hex");
  let changedSession: OrderSession | undefined;
  let whatsappRecipient: ReturnType<typeof toWhatsAppOrderRecipient> = null;
  const recipient = await withTenantTransaction(tenant, actor, async (client) => {
    const session = await findOrderSessionRow(client, sessionId);
    if (!session) throw new NotFoundError("SESSION_NOT_FOUND");
    if (!canManageSession(actor, session.seller_id)) throw new ForbiddenError();
    if (session.status === "cancelado") throw new ValidationError("SESSION_CANCELLED");
    const items = (await listOrderSessionItemRowsBySession(client, sessionId)).map((item) => item.snapshot)
      .filter((item) => item.qty > 0);
    if (items.length === 0) throw new ValidationError("EMPTY_ORDER");
    if (session.freight_quote_id == null) throw new ValidationError("SHIPPING_REQUIRED");
    if (!session.client_id) throw new ValidationError("CLIENT_REQUIRED");
    const registration = await findClientRow(client, session.client_id);
    if (!registration || !registration.name.trim() || !registration.cpf_cnpj?.trim() ||
        !registration.email?.trim()) throw new ValidationError("INCOMPLETE_CLIENT");
    if (session.delivery_fulfillment_mode === "address_delivery" && !registration.cep?.trim()) {
        throw new ValidationError("DELIVERY_ADDRESS_REQUIRED");
    }
    const user = await findUserRowByClientId(client, session.client_id);
    if (!user) throw new ValidationError("CLIENT_LOGIN_REQUIRED");
    const updated = await setOrderSessionPaymentTokenRow(client, sessionId, digest(token));
    if (!updated) throw new NotFoundError("SESSION_NOT_FOUND");
    changedSession = toOrderSession(updated, items);
    whatsappRecipient = toWhatsAppOrderRecipient(registration);
    return { id: user.id, role: user.role, email: user.email, name: user.name };
  });
  if (changedSession) {
    notifySession(tenant.id, changedSession);
    scheduleSessionBroadcast(changedSession);
  }
  const paymentUrl = `${publicOrigin}/${tenant.slug}/pagar/${token}`;
  notifyPaymentLink(tenant, recipient, paymentUrl);
  sendPaymentLinkWhatsApp(tenant, whatsappRecipient, paymentUrl);
  return { token };
}
