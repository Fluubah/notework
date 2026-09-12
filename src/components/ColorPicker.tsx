import { useState } from 'react'
import { hexToRgb, hslToHex, isValidHex } from '../lib/colors'

interface Props {
  value: string
  onChange: (hex: string) => void
}

function hexToHue(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 210
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 210
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return ((h * 60) + 360) % 360
}

/**
 * Free-form colour picker: a hue strip for quick picks, the native colour
 * dialog for full control, and a hex field. No preset palette – the user owns
 * the colour.
 */
export function ColorPicker({ value, onChange }: Props) {
  // Local text mirrors `value` but tolerates partial typing; resync when the
  // committed value changes from outside.
  const [text, setText] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }

  return (
    <div className="color-picker">
      <label className="color-swatch" style={{ background: value }} title="Open colour dialog">
        <input type="color" value={isValidHex(value) ? value : '#4f6df5'} onChange={(e) => onChange(e.target.value)} aria-label="Colour" />
      </label>
      <input
        type="range"
        className="hue-strip"
        min={0}
        max={359}
        value={Math.round(hexToHue(value))}
        onChange={(e) => onChange(hslToHex(Number(e.target.value), 0.62, 0.55))}
        aria-label="Hue"
      />
      <input
        className="input"
        value={text}
        onChange={(e) => {
          const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
          setText(v)
          if (isValidHex(v)) onChange(v.toLowerCase())
        }}
        onBlur={() => setText(value)}
        spellCheck={false}
        aria-label="Hex colour"
      />
    </div>
  )
}
