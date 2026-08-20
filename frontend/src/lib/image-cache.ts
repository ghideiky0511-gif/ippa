const SERVICE_WORKER_PATH = '/push-sw.js';

/** Registers the worker that keeps remote catalog images in Cache Storage. */
export function enableImageCache(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' });
}
