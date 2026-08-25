"use client";

const INSTALLATION_ID_STORAGE_KEY = "ippa_push_installation_id";
const PUSH_SW_PATH = "/push-sw.js";

export type PushConfigResponse = { enabled: boolean; configured: boolean; vapidPublicKey: string | null };
export type NotificationItem = { id: string; module: string; event: string; created_at: string; read: boolean; read_at?: string | null; title: string; body: string; url: string; tag?: string | null; data?: Record<string, unknown> };
export type NotificationsListResponse = { items: NotificationItem[]; total: number; unread: number };
export type NotificationsSummaryResponse = { total: number; unread: number };
export type PushStatusResponse = { active: boolean; totalActive: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível comunicar com o servidor.");
  return data as T;
}

export function browserSupportsPush(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

function installationId(): string {
  const saved = localStorage.getItem(INSTALLATION_ID_STORAGE_KEY);
  if (saved) return saved;
  const value = crypto.randomUUID();
  localStorage.setItem(INSTALLATION_ID_STORAGE_KEY, value);
  return value;
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const base64 = (value + "=".repeat((4 - value.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const result = await navigator.serviceWorker.register(PUSH_SW_PATH, { scope: "/" });
  await navigator.serviceWorker.ready;
  return result;
}

export const fetchPushConfig = () => request<PushConfigResponse>("/push/config");
export async function fetchPushStatus(): Promise<PushStatusResponse> {
  if (!browserSupportsPush()) return { active: false, totalActive: 0 };
  const subscription = await (await registration()).pushManager.getSubscription();
  const query = new URLSearchParams({ installationId: installationId() });
  if (subscription) query.set("endpoint", subscription.endpoint);
  return request<PushStatusResponse>(`/push/status?${query}`);
}

export async function activatePushNotifications(): Promise<void> {
  if (!browserSupportsPush()) throw new Error("Este navegador não suporta notificações push.");
  const config = await fetchPushConfig();
  if (!config.enabled || !config.configured || !config.vapidPublicKey) throw new Error("Push não está configurado neste ambiente.");
  if (await Notification.requestPermission() !== "granted") throw new Error("Permissão de notificação não concedida.");
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription() ?? await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey) as unknown as BufferSource });
  const json = subscription.toJSON();
  await request("/push/subscriptions", { method: "POST", body: JSON.stringify({ installationId: installationId(), endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth }, userAgent: navigator.userAgent }) });
}

export const fetchNotifications = (filter = "unread") => request<NotificationsListResponse>(`/notifications?filtro=${filter === "all" ? "todas" : "nao_lidas"}&limite=20`);
export const fetchNotificationsSummary = () => request<NotificationsSummaryResponse>("/notifications/summary");
export const markNotificationAsRead = (id: string) => request<{ ok: boolean }>(`/notifications/${id}/read`, { method: "PATCH" });
export const markAllNotificationsAsRead = () => request<{ marked: number }>("/notifications/read-all", { method: "PATCH" });
