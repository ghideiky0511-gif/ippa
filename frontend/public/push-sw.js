self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(payload.title || "IPPA", { body: payload.body || "Você tem uma nova notificação.", tag: payload.tag, data: { url: payload.url || "/", ...(payload.data || {}) } }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
