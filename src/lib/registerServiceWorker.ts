/**
 * Registers the no-op service worker that makes the app installable.
 * See public/sw.js -- it caches nothing, so there is no stale-asset risk.
 * Skipped in dev, where a worker only gets in the way of HMR.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((err) => {
      // Installability is a nice-to-have; the app works fine without it.
      console.warn('Service worker registration failed:', err)
    })
  })
}
