/**
 * Installable-app support: registers the service worker (production only), remembers the
 * browser's "install" offer, and tells the interface when a new version is ready.
 *
 * Events on window (listened to by components/PwaStatus.jsx and InstallAppCard.jsx):
 *   biztrack:pwa-update       a new version has been downloaded and is waiting
 *   biztrack:pwa-installable  { available: boolean } — the browser will let the app be installed
 */
let deferredPrompt = null;
let registration = null;

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

export const isStandalone = () => Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
export const canInstall = () => deferredPrompt !== null;

/** Shows the browser's own install dialog. Returns "accepted", "dismissed" or "unavailable". */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  emit('biztrack:pwa-installable', { available: false });
  return outcome;
}

/** Swaps to the downloaded version; the page reloads itself once the new worker takes over. */
export function applyUpdate() {
  if (registration?.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
}

export function registerPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // keep it for our own button
    deferredPrompt = event;
    emit('biztrack:pwa-installable', { available: true });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit('biztrack:pwa-installable', { available: false });
  });

  // Developing with `npm run dev`: a service worker would cache files the dev server is changing.
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    } catch (err) {
      console.warn('Service worker not registered:', err);
      return;
    }
    // A worker already waiting (found while the page was closed) still counts as an update.
    if (registration.waiting && navigator.serviceWorker.controller) emit('biztrack:pwa-update');
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) emit('biztrack:pwa-update');
      });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    // A long-open window should still find out about a release.
    setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
  });
}
