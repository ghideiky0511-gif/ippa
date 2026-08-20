self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

const IMAGE_CACHE = "ippa-catalog-images-v1";

self.addEventListener("fetch", (event) => {
    const { request } = event;
    // Local images already use the browser/Next cache. Cache product images
    // hosted externally because their origins may not provide cache headers.
    if (
        request.destination !== "image" ||
        new URL(request.url).origin === self.location.origin
    )
        return;

    event.respondWith(
        (async () => {
            const cache = await caches.open(IMAGE_CACHE);
            const cached = await cache.match(request);
            if (cached) return cached;

            const response = await fetch(request);
            if (response.ok || response.type === "opaque") {
                await cache.put(request, response.clone());
            }
            return response;
        })(),
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
