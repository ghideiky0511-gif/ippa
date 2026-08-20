import type { Tenant } from "@/lib/db/tenant";
import {
    enqueueNotification,
    notifyPaymentLinkAvailable,
} from "./pushNotificationService";
import {
    sendOrderConfirmedEmail,
    sendPaymentLinkEmail,
    sendFirstAccessConfirmationEmail,
    sendSignupConfirmationEmail,
} from "@/lib/email";
import { errorMeta, logger } from "@/lib/logger";

export function notifySignup(
    tenant: Tenant,
    user: { email: string; name: string },
): void {
    void sendSignupConfirmationEmail({
        to: user.email,
        name: user.name,
        storeName: tenant.name,
    });
}

export async function notifyFirstAccessConfirmation(
    tenant: Tenant,
    user: { email: string; name: string },
    link: string,
): Promise<void> {
    try {
        const delivery = await sendFirstAccessConfirmationEmail({
            to: user.email,
            name: user.name,
            link,
            storeName: tenant.name,
        });
        const log = delivery === "sent" ? logger.info : logger.warn;
        log("first-access-email", "Processamento do e-mail de confirmação concluído", {
            tenantId: tenant.id,
            delivery,
        });
    } catch (error) {
        // Não propaga para não desfazer a solicitação persistida no banco.
        // O próximo envio substitui o token pendente com segurança.
        logger.error("first-access-email", "Falha inesperada ao processar e-mail de confirmação", {
            tenantId: tenant.id,
            ...errorMeta(error),
        });
    }
}

export function notifyPaymentLink(
    tenant: Tenant,
    user: {
        id: string;
        role: import("@/lib/types").UserRole;
        email: string;
        name: string;
    },
    link: string,
): void {
    void sendPaymentLinkEmail({
        to: user.email,
        name: user.name,
        link,
        storeName: tenant.name,
    });
    void notifyPaymentLinkAvailable(tenant, user, link).catch((error) =>
        console.error("Falha ao criar notificação de link de pagamento", error),
    );
}

export function notifyOrderConfirmed(
    tenant: Tenant,
    user: {
        id: string;
        role: import("@/lib/types").UserRole;
        email: string;
        name: string;
    },
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
        module: "orders",
        event: "confirmed",
        title: "Pedido confirmado",
        body: `Seu pedido #${order.id.slice(0, 8)} foi confirmado.`,
        url: "/pedidos",
        tag: `order-${order.id}`,
        idempotencyKey: `order-confirmed:${order.id}:${user.id}`,
        data: { orderId: order.id, total: order.total },
    }).catch((error) =>
        console.error("Falha ao criar notificação de pedido", error),
    );
}

export function notifyNewOrderForSeller(
    tenant: Tenant,
    user: { id: string; role: import("@/lib/types").UserRole },
    order: { id: string; clientName?: string | null; total: number },
): void {
    void enqueueNotification(tenant, user, {
        module: "orders",
        event: "created",
        title: "Novo pedido recebido",
        body: `${order.clientName || "Uma cliente"} finalizou um pedido.`,
        url: "/workspace/pedidos",
        tag: `order-${order.id}`,
        idempotencyKey: `order-created:${order.id}:${user.id}`,
        data: { orderId: order.id, total: order.total },
    }).catch((error) =>
        console.error("Falha ao criar notificação interna de pedido", error),
    );
}
