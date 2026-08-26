self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

const IMAGE_CACHE = "ippa-catalog-images-v1";
// Sem isso o cache cresce sem limite (um catálogo grande tem centenas de
// fotos únicas) até estourar a cota de armazenamento do navegador — quando
// isso acontece, o Chrome costuma limpar o Cache Storage inteiro da origem
// de uma vez em vez de descartar só os itens antigos, e a próxima imagem
// (mesmo a primeira, já "cacheada") dá miss. cache.keys() devolve em ordem
// de inserção, então re-inserir num hit (delete+put) empurra pro fim e
// aproxima de um LRU de verdade.
const MAX_IMAGE_CACHE_ENTRIES = 300;

async function trimImageCache(cache) {
    const keys = await cache.keys();
    const excess = keys.length - MAX_IMAGE_CACHE_ENTRIES;
    if (excess <= 0) return;
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

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
            if (cached) {
                await cache.delete(request);
                await cache.put(request, cached.clone());
                return cached;
            }

            const response = await fetch(request);
            if (response.ok || response.type === "opaque") {
                await cache.put(request, response.clone());
                await trimImageCache(cache);
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
