import type { Tenant } from "@/lib/db/tenant";
import { enqueueNotification } from "./pushNotificationService";
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
  user: { id: string; role: import("@/lib/types").UserRole; email: string; name: string },
  order: { id: string; total: number },
): void {
  void sendOrderConfirmedEmail({
    to: user.email,
    name: user.name,
    total: order.total,
    orderId: order.id,
    storeName: tenant.name,
  });
  // A caixa de entrada é criada mesmo sem inscrição Web Push; assim o aviso
  // aparece quando a pessoa voltar ao sistema.
  void enqueueNotification(tenant, user, {
    module: "orders", event: "confirmed", title: "Pedido confirmado",
    body: `Seu pedido #${order.id.slice(0, 8)} foi confirmado.`, url: "/pedidos",
    tag: `order-${order.id}`, idempotencyKey: `order-confirmed:${order.id}:${user.id}`,
    data: { orderId: order.id, total: order.total },
  }).catch((error) => console.error("Falha ao criar notificação de pedido", error));
}

export function notifyNewOrderForSeller(
  tenant: Tenant,
  user: { id: string; role: import("@/lib/types").UserRole },
  order: { id: string; clientName?: string | null; total: number },
): void {
  void enqueueNotification(tenant, user, {
    module: "orders", event: "created", title: "Novo pedido recebido",
    body: `${order.clientName || "Uma cliente"} finalizou um pedido.`, url: "/workspace/pedidos",
    tag: `order-${order.id}`, idempotencyKey: `order-created:${order.id}:${user.id}`,
    data: { orderId: order.id, total: order.total },
  }).catch((error) => console.error("Falha ao criar notificação interna de pedido", error));
}
