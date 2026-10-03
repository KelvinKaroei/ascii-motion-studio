import type { AsciiFrame, Settings } from '../types'

export const defaults: Settings = {
  width: 120,
  height: 42,
  density: 1,
  chars: ' .,:;i1tfLCG08@',
  color: 'truecolor',
  style: 'studio',
  contrast: 1,
  sharpness: 0,
  autoContrast: false,
  dither: false,
  sortCharacters: false,
  background: 'none',
  maskThreshold: 0.5,
  feather: 0.12,
  motionSensitivity: 0.65,
  keyColor: '#00ff00',
  keyTolerance: 0.25,
}
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
export function palette256(r: number, g: number, b: number): [number, number, number, number] {
  const levels = [0, 95, 135, 175, 215, 255]
  const nearest = (v: number) =>
    levels.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(levels[best] - v) ? i : best), 0)
  const ri = nearest(r),
    gi = nearest(g),
    bi = nearest(b)
  const grey = Math.max(0, Math.min(23, Math.round(((r + g + b) / 3 - 8) / 10)))
  const gv = 8 + grey * 10
  const cubeError = (r - levels[ri]) ** 2 + (g - levels[gi]) ** 2 + (b - levels[bi]) ** 2
  if ((r - gv) ** 2 + (g - gv) ** 2 + (b - gv) ** 2 < cubeError) return [232 + grey, gv, gv, gv]
  return [16 + 36 * ri + 6 * gi + bi, levels[ri], levels[gi], levels[bi]]
}
/** One display cell per printable code point. Excludes escape/control and wide glyphs. */
export function safeCharacters(input: string) {
  return [...input]
    .filter((c) => {
      const n = c.codePointAt(0)!
      return n >= 32 && n !== 127 && (n <= 126 || (n >= 0x2500 && n <= 0x259f))
    })
    .slice(0, 128)
}
export function convert(
  pixels: Uint8Array,
  width: number,
  height: number,
  settings: Settings,
  includeHtml = false,
  mask?: Float32Array,
  orderedChars?: string[],
): AsciiFrame {
  const started = performance.now()
  const ramp =
    settings.color === 'blocks' ? [...' ░▒▓█'] : orderedChars || safeCharacters(settings.chars)
  if (!ramp.length) ramp.push(...' .:-=+*#%@')
  const luminance = new Float32Array(width * height)
  const histogram = new Uint32Array(256)
  let visible = 0
  for (let cell = 0; cell < luminance.length; cell++) {
    const i = cell * 3
    const value = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255
    luminance[cell] = value
    if (!mask || mask[cell] > 0.5) {
      histogram[Math.round(value * 255)]++
      visible++
    }
  }
  let low = 0,
    high = 1
  if (settings.autoContrast && visible) {
    let count = 0
    for (let i = 0; i < 256; i++) {
      count += histogram[i]
      if (count >= visible * 0.02) {
        low = i / 255
        break
      }
    }
    count = 0
    for (let i = 255; i >= 0; i--) {
      count += histogram[i]
      if (count >= visible * 0.02) {
        high = i / 255
        break
      }
    }
    if (high - low < 0.08) {
      low = 0
      high = 1
    }
  }
  const errors = settings.dither ? new Float32Array(width * height) : null
  const chars: string[] = [],
    colors = new Uint8Array(width * height * 3)
  let ansi = '\x1b[H',
    text = '',
    html = ''
  for (let y = 0; y < height; y++) {
    let previous = '',
      run = '',
      runColor = ''
    const flush = () => {
      if (run) html += `<span style="color:${runColor}">${escapeHtml(run)}</span>`
      run = ''
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      let r = pixels[i],
        g = pixels[i + 1],
        b = pixels[i + 2]
      const cell = y * width + x
      let value = luminance[cell]
      if (settings.sharpness > 0) {
        let total = 0,
          count = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              total += luminance[ny * width + nx]
              count++
            }
          }
        value += settings.sharpness * (value - total / count)
      }
      value = ((value - low) / (high - low) - 0.5) * settings.contrast + 0.5
      const coverage = mask ? mask[cell] : 1
      const light = Math.max(
        0,
        Math.min(
          1,
          Math.pow(Math.max(0, Math.min(1, value)), 1 / settings.density) * coverage +
            (errors?.[cell] || 0),
        ),
      )
      const index = Math.min(ramp.length - 1, Math.floor(light * ramp.length))
      const char = coverage < 0.04 ? ' ' : ramp[index]
      if (errors && coverage >= 0.04 && ramp.length > 1) {
        const error = light - index / (ramp.length - 1)
        if (x + 1 < width) errors[cell + 1] += (error * 7) / 16
        if (y + 1 < height) {
          if (x > 0) errors[cell + width - 1] += (error * 3) / 16
          errors[cell + width] += (error * 5) / 16
          if (x + 1 < width) errors[cell + width + 1] += error / 16
        }
      }
      let code = ''
      if (settings.style === 'matrix') {
        r = 73
        g = 230
        b = 143
      } else if (settings.style === 'crt') {
        r = 133
        g = 238
        b = 171
      } else if (settings.style === 'retro') {
        r = 255
        g = 188
        b = 97
      } else if (settings.color === 'mono') {
        r = 219
        g = 225
        b = 234
      }
      r = Math.round(r * coverage)
      g = Math.round(g * coverage)
      b = Math.round(b * coverage)
      if (settings.color === 'ansi256') {
        const p = palette256(r, g, b)
        ;[r, g, b] = p.slice(1)
        code = `\x1b[38;5;${p[0]}m`
      } else code = `\x1b[38;2;${r};${g};${b}m`
      if (code !== previous) {
        ansi += code
        previous = code
      }
      ansi += char
      text += char
      chars.push(char)
      colors.set([r, g, b], i)
      if (includeHtml) {
        const color = `rgb(${r},${g},${b})`
        if (runColor !== color) {
          flush()
          runColor = color
        }
        run += char
      }
    }
    flush()
    if (y < height - 1) {
      ansi += '\r\n'
      text += '\n'
      if (includeHtml) html += '\n'
    }
  }
  return {
    ansi: ansi + '\x1b[0m',
    text,
    html,
    chars,
    colors,
    width,
    height,
    ms: performance.now() - started,
  }
}
