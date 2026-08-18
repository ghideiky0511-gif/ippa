import { createHash, randomBytes } from "node:crypto";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { findClientRow } from "@/models/clientsModel";
import { findOrderSessionRow, listOrderSessionItemRowsBySession, setOrderSessionPaymentTokenRow } from "@/models/ordersModel";
import { findUserRowByClientId } from "@/models/usersModel";
import { notifyPaymentLink } from "@/services/notifications";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPaymentLink(
  tenant: Tenant,
  actor: AuthUser,
  sessionId: string,
  publicOrigin: string,
): Promise<{ token: string }> {
  if (actor.role !== "vendedora") throw new ForbiddenError();
  const token = randomBytes(24).toString("hex");
  const recipient = await withTenantTransaction(tenant, actor, async (client) => {
    const session = await findOrderSessionRow(client, sessionId);
    if (!session) throw new NotFoundError("SESSION_NOT_FOUND");
    if (session.seller_id !== actor.id) throw new ForbiddenError();
    const items = (await listOrderSessionItemRowsBySession(client, sessionId)).map((item) => item.snapshot)
      .filter((item) => item.qty > 0);
    if (items.length === 0) throw new ValidationError("EMPTY_ORDER");
    if (!session.shipping) throw new ValidationError("SHIPPING_REQUIRED");
    if (!session.client_id) throw new ValidationError("CLIENT_REQUIRED");
    const registration = await findClientRow(client, session.client_id);
    if (!registration || !registration.name.trim() || !registration.cpf_cnpj?.trim() ||
        !registration.email?.trim() || !registration.cep?.trim()) throw new ValidationError("INCOMPLETE_CLIENT");
    const user = await findUserRowByClientId(client, session.client_id);
    if (!user) throw new ValidationError("CLIENT_LOGIN_REQUIRED");
    await setOrderSessionPaymentTokenRow(client, sessionId, digest(token));
    return { email: user.email, name: user.name };
  });
  notifyPaymentLink(tenant, recipient, `${publicOrigin}/${tenant.slug}/pagar/${token}`);
  return { token };
}
