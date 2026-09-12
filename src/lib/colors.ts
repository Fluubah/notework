/** Colour helpers for user-picked category colours. */

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().replace('#', '')
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function isValidHex(hex: string): boolean {
  return hexToRgb(hex) !== null
}

/** Relative luminance (sRGB). */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0.5
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

/** Black or white, whichever reads better on the given colour. */
export function readableTextOn(hex: string): string {
  return luminance(hex) > 0.42 ? '#111318' : '#ffffff'
}

/** `rgba()` string with alpha applied to a hex colour. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

/** A neutral fallback used when an event has no category. */
export const UNCATEGORIZED_COLOR = '#8a8f98'

/**
 * A pleasant starting hue for a *new* category so the picker doesn't open on
 * a random colour. Not a preset list – the user always chooses.
 */
export function suggestColor(existing: string[]): string {
  const golden = 137.508
  const hue = (existing.length * golden + 210) % 360
  return hslToHex(hue, 0.62, 0.55)
}

export function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (x: number) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, '0')
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}
