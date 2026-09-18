const SERVICE_WORKER_PATH = "/push-sw.js";

/** Registers the worker used for push notifications; it does not intercept images. */
export function enableImageCache(): void {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
        return;
    void navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: "/" });
}
