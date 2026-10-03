import { defaults } from './ascii'
import type { Settings } from '../types'

/** Persisted preferences are untrusted input and may belong to an older app version. */
export function restoreSettings(json: string | null): Settings {
  try {
    const saved = JSON.parse(json || '{}') as Partial<Settings> | null
    if (!saved || typeof saved !== 'object') return { ...defaults }
    return {
      ...defaults,
      contrast:
        typeof saved.contrast === 'number'
          ? Math.max(0.5, Math.min(2.5, saved.contrast))
          : defaults.contrast,
      sharpness:
        typeof saved.sharpness === 'number'
          ? Math.max(0, Math.min(2, saved.sharpness))
          : defaults.sharpness,
      autoContrast: saved.autoContrast === true,
      dither: saved.dither === true,
      sortCharacters: saved.sortCharacters === true,
      background: ['none', 'person', 'motion', 'chroma'].includes(saved.background || '')
        ? saved.background!
        : defaults.background,
      maskThreshold:
        typeof saved.maskThreshold === 'number'
          ? Math.max(0.1, Math.min(0.9, saved.maskThreshold))
          : defaults.maskThreshold,
      feather:
        typeof saved.feather === 'number'
          ? Math.max(0, Math.min(0.5, saved.feather))
          : defaults.feather,
      motionSensitivity:
        typeof saved.motionSensitivity === 'number'
          ? Math.max(0, Math.min(1, saved.motionSensitivity))
          : defaults.motionSensitivity,
      keyColor:
        typeof saved.keyColor === 'string' && /^#[0-9a-f]{6}$/i.test(saved.keyColor)
          ? saved.keyColor
          : defaults.keyColor,
      keyTolerance:
        typeof saved.keyTolerance === 'number'
          ? Math.max(0.01, Math.min(0.9, saved.keyTolerance))
          : defaults.keyTolerance,
      density:
        typeof saved.density === 'number' && Number.isFinite(saved.density)
          ? Math.max(0.3, Math.min(2.5, saved.density))
          : defaults.density,
      chars: typeof saved.chars === 'string' ? saved.chars.slice(0, 128) : defaults.chars,
      color: ['mono', 'truecolor', 'ansi256', 'blocks'].includes(saved.color || '')
        ? saved.color!
        : defaults.color,
      style: ['studio', 'matrix', 'crt', 'retro'].includes(saved.style || '')
        ? saved.style!
        : defaults.style,
    }
  } catch {
    return { ...defaults }
  }
}
