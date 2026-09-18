self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            // Remove o cache criado por versões anteriores, que faziam um
            // fetch extra para cada imagem remota do catálogo.
            caches.delete("ippa-catalog-images-v1"),
        ]),
    );
});

self.addEventListener("push", (event) => {
    const payload = event.data ? event.data.json() : {};
    event.waitUntil(
        self.registration.showNotification(payload.title || "IPPA", {
            body: payload.body || "Você tem uma nova notificação.",
            tag: payload.tag,
            data: { url: payload.url || "/", ...(payload.data || {}) },
        }),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
