import type { Tenant } from "@/lib/db/tenant";
import {
  sendOrderConfirmedEmail,
  sendPaymentLinkEmail,
  sendSignupConfirmationEmail,
} from "@/lib/email";

export function notifySignup(tenant: Tenant, user: { email: string; name: string }): void {
  void sendSignupConfirmationEmail({ to: user.email, name: user.name, storeName: tenant.name });
}

export function notifyPaymentLink(
  tenant: Tenant,
  user: { email: string; name: string },
  link: string,
): void {
  void sendPaymentLinkEmail({ to: user.email, name: user.name, link, storeName: tenant.name });
}

export function notifyOrderConfirmed(
  tenant: Tenant,
  user: { email: string; name: string },
  order: { id: string; total: number },
): void {
  void sendOrderConfirmedEmail({
    to: user.email,
    name: user.name,
    total: order.total,
    orderId: order.id,
    storeName: tenant.name,
  });
}
