/** Viewport breakpoint shared between the mobile CSS and the components that
 *  need to behave differently on a phone (the sidebar drawer). Keep this in
 *  sync with the `@media (max-width: 760px)` block in styles/layout.css. */
export const MOBILE_QUERY = '(max-width: 760px)'

/** True when the viewport is phone-sized. Safe to call outside the browser. */
export function isMobileViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(MOBILE_QUERY).matches
}
