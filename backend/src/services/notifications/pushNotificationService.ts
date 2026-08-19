import { createHash } from "node:crypto";
import webpush from "web-push";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import {
    activeSubscriptionsForUser,
    claimPendingNotifications,
    countActiveSubscriptions,
    deactivateSubscription,
    finishNotificationDelivery,
    insertNotification,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    notificationSummary,
    upsertPushSubscription,
} from "@/models/notificationModel";
import { listAdministradorUserIds } from "@/models/usersModel";

const maxAttempts = Math.max(1, Number(process.env.PUSH_MAX_ATTEMPTS ?? 5));

function configured(): boolean {
    return Boolean(
        process.env.VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY &&
        process.env.VAPID_SUBJECT,
    );
}

function keyFor(userId: string, input: NotificationInput): string {
    if (input.idempotencyKey) return input.idempotencyKey.slice(0, 128);
    return createHash("sha256")
        .update(JSON.stringify({ userId, ...input }))
        .digest("hex");
}

export interface NotificationInput {
    module: string;
    event: string;
    title: string;
    body: string;
    url?: string;
    tag?: string;
    data?: Record<string, unknown>;
    idempotencyKey?: string;
}

/** Notificação essencial para o cliente concluir um pedido pendente. */
export async function notifyPaymentLinkAvailable(
    tenant: Tenant,
    user: Pick<AuthUser, "id" | "role">,
    link: string,
): Promise<void> {
    await enqueueNotification(tenant, user, {
        module: "orders",
        event: "payment_link_available",
        title: "Pagamento aguardando",
        body: "Seu link de pagamento está disponível.",
        url: link,
        tag: `payment-link-${user.id}`,
        idempotencyKey: `payment-link:${user.id}:${link}`,
    });
}

export async function enqueueNotification(
    tenant: Tenant,
    recipient: Pick<AuthUser, "id" | "role">,
    input: NotificationInput,
): Promise<void> {
    await withTenantTransaction(tenant, recipient, (client) =>
        insertNotification(client, {
            user_id: recipient.id,
            module: input.module,
            event: input.event,
            title: input.title,
            body: input.body,
            url: input.url || "/",
            tag: input.tag ?? null,
            data: input.data ?? {},
            idempotencyKey: keyFor(recipient.id, input),
        }),
    );
    // Entrega imediata é uma otimização; a fila persistida permite uma execução posterior sem perda.
    void dispatchNotifications(tenant, recipient, 20).catch((error) =>
        console.error("Falha ao despachar push", error),
    );
}

/** Alerta operacional (ex.: provider externo degradado) — vai para todo administrador do tenant. */
export async function notifyAdmins(tenant: Tenant, input: NotificationInput): Promise<void> {
    const adminIds = await withTenantTransaction(tenant, { role: "administrador" }, (client) =>
        listAdministradorUserIds(client),
    );
    for (const adminId of adminIds) {
        await enqueueNotification(tenant, { id: adminId, role: "administrador" }, input);
    }
}

export async function pushConfig() {
    return {
        enabled: process.env.PUSH_ENABLED !== "false",
        configured: configured(),
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    };
}

export async function registerPushSubscription(
    tenant: Tenant,
    user: AuthUser,
    body: Record<string, unknown>,
): Promise<void> {
    const keys = body.keys;
    if (
        !keys ||
        typeof keys !== "object" ||
        Array.isArray(keys) ||
        typeof body.installationId !== "string" ||
        typeof body.endpoint !== "string" ||
        typeof (keys as Record<string, unknown>).p256dh !== "string" ||
        typeof (keys as Record<string, unknown>).auth !== "string"
    )
        throw new Error("INVALID_PUSH_SUBSCRIPTION");
    const installationId = body.installationId.trim();
    const endpoint = body.endpoint.trim();
    const p256dh = (keys as Record<string, string>).p256dh.trim();
    const auth = (keys as Record<string, string>).auth.trim();
    if (
        !installationId ||
        installationId.length > 120 ||
        !endpoint.startsWith("https://") ||
        !p256dh ||
        !auth
    )
        throw new Error("INVALID_PUSH_SUBSCRIPTION");
    await withTenantTransaction(tenant, user, (client) =>
        upsertPushSubscription(client, {
            userId: user.id,
            installationId,
            endpoint,
            p256dh,
            auth,
            userAgent:
                typeof body.userAgent === "string"
                    ? body.userAgent.slice(0, 2000)
                    : undefined,
        }),
    );
}

export async function pushStatus(
    tenant: Tenant,
    user: AuthUser,
    installationId?: string,
    endpoint?: string,
) {
    const total = await withTenantTransaction(tenant, user, (client) =>
        countActiveSubscriptions(client, user.id, installationId, endpoint),
    );
    return { active: total > 0, totalActive: total };
}

export async function inbox(
    tenant: Tenant,
    user: AuthUser,
    unreadOnly: boolean,
    limit: number,
) {
    const [items, summary] = await withTenantTransaction(
        tenant,
        user,
        async (client) =>
            Promise.all([
                listNotifications(
                    client,
                    user.id,
                    unreadOnly,
                    Math.min(Math.max(limit, 1), 100),
                ),
                notificationSummary(client, user.id),
            ]),
    );
    return {
        items: items.map((item) => ({ ...item, read: Boolean(item.read_at) })),
        ...summary,
    };
}

export async function readNotification(
    tenant: Tenant,
    user: AuthUser,
    id: string,
) {
    return withTenantTransaction(tenant, user, (client) =>
        markNotificationRead(client, user.id, id),
    );
}

export async function readAllNotifications(tenant: Tenant, user: AuthUser) {
    return withTenantTransaction(tenant, user, (client) =>
        markAllNotificationsRead(client, user.id),
    );
}

export async function dispatchNotifications(
    tenant: Tenant,
    actor: Pick<AuthUser, "id" | "role">,
    limit = 100,
) {
    if (process.env.PUSH_ENABLED === "false")
        return { processed: 0, sent: 0, failed: 0 };
    const jobs = await withTenantTransaction(tenant, actor, (client) =>
        claimPendingNotifications(client, Math.min(Math.max(limit, 1), 500)),
    );
    let sent = 0;
    let failed = 0;
    for (const job of jobs) {
        await withTenantTransaction(tenant, actor, async (client) => {
            const subscriptions = await activeSubscriptionsForUser(
                client,
                job.user_id,
            );
            if (!subscriptions.length) {
                await finishNotificationDelivery(client, job.id, "sent", {
                    status: "skipped",
                    reason: "no_active_subscription",
                });
                sent += 1;
                return;
            }
            if (!configured()) {
                await finishNotificationDelivery(
                    client,
                    job.id,
                    "pending",
                    { status: "pending", reason: "vapid_not_configured" },
                    "VAPID não configurado.",
                );
                failed += 1;
                return;
            }
            const payload = JSON.stringify({
                title: job.title,
                body: job.body,
                url: job.url,
                tag: job.tag ?? job.id,
                data: job.data,
            });
            const results = await Promise.all(
                subscriptions.map(async (subscription) => {
                    try {
                        const response = await webpush.sendNotification(
                            {
                                endpoint: subscription.endpoint,
                                keys: {
                                    p256dh: subscription.p256dh,
                                    auth: subscription.auth,
                                },
                            },
                            payload,
                            {
                                vapidDetails: {
                                    subject: process.env.VAPID_SUBJECT!,
                                    publicKey: process.env.VAPID_PUBLIC_KEY!,
                                    privateKey: process.env.VAPID_PRIVATE_KEY!,
                                },
                            },
                        );
                        return {
                            id: subscription.id,
                            ok: true,
                            statusCode: response.statusCode,
                        };
                    } catch (error) {
                        const statusCode = Number(
                            (error as { statusCode?: number }).statusCode ?? 0,
                        );
                        if (statusCode === 404 || statusCode === 410)
                            await deactivateSubscription(
                                client,
                                subscription.id,
                            );
                        return {
                            id: subscription.id,
                            ok: false,
                            statusCode,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : "Falha no provedor",
                        };
                    }
                }),
            );
            const ok = results.some((result) => result.ok);
            const retryable = results.some(
                (result) =>
                    !result.ok &&
                    [0, 408, 429, 500, 502, 503, 504].includes(
                        result.statusCode,
                    ),
            );
            const status = ok
                ? "sent"
                : retryable && job.attempts < maxAttempts
                  ? "pending"
                  : "failed";
            await finishNotificationDelivery(
                client,
                job.id,
                status,
                { results },
                ok ? undefined : "Falha ao enviar Web Push.",
            );
            if (status === "sent") sent += 1;
            else failed += 1;
        });
    }
    return { processed: jobs.length, sent, failed };
}
