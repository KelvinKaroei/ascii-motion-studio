import { describe, expect, it } from 'vitest'
import { convert, defaults, safeCharacters } from '../src/engine/ascii'
import { characterPresets } from '../src/engine/characters'
import { chromaMask, MotionMask, sampleFrame, softThreshold } from '../src/engine/masks'
import { restoreSettings } from '../src/engine/settings'

describe('detail and character presets', () => {
  it('offers every printable ASCII character without terminal escapes', () => {
    const full = characterPresets.find((p) => p.label === 'ASCII completo')!.chars
    expect(safeCharacters(full)).toHaveLength(95)
    expect(new Set(full).size).toBe(95)
  })
  it('contrasts luminance without changing source RGB values', () => {
    const pixels = new Uint8Array([100, 100, 100, 155, 155, 155])
    const plain = convert(pixels, 2, 1, { ...defaults, chars: ' .:-=+*#%@' })
    const enhanced = convert(pixels, 2, 1, { ...defaults, contrast: 2.5, chars: ' .:-=+*#%@' })
    expect(enhanced.text).not.toEqual(plain.text)
    expect(enhanced.colors).toEqual(plain.colors)
  })
  it('removes masked cells even when the chosen ramp has no space', () => {
    const frame = convert(
      new Uint8Array([255, 255, 255, 255, 255, 255]),
      2,
      1,
      { ...defaults, chars: 'ABC' },
      true,
      new Float32Array([0, 1]),
    )
    expect(frame.text).toBe(' C')
    expect(frame.html).toContain('> </span>')
    expect([...frame.colors.slice(0, 3)]).toEqual([0, 0, 0])
  })
  it('keeps dithering in bounds and changes a flat intermediate tone', () => {
    const pixels = new Uint8Array(100 * 3).fill(120)
    const a = convert(pixels, 10, 10, { ...defaults, chars: ' @' })
    const b = convert(pixels, 10, 10, { ...defaults, chars: ' @', dither: true })
    expect(b.text).not.toEqual(a.text)
    expect(b.chars).toHaveLength(100)
    expect(new Set(b.chars)).toEqual(new Set([' ', '@']))
  })
})
describe('background removal', () => {
  it('preserves foreground instead of inverting the mask', () => {
    expect(softThreshold(0.95, 0.5, 0.1)).toBe(1)
    expect(softThreshold(0.05, 0.5, 0.1)).toBe(0)
  })
  it('removes the selected key color and keeps another color', () => {
    const mask = chromaMask(
      { index: 0, width: 2, height: 1, pixels: new Uint8Array([0, 255, 0, 255, 0, 0]) },
      defaults,
    )
    expect([...mask]).toEqual([0, 1])
  })
  it('does not mix removed green background into red foreground when resizing', () => {
    const sampled = sampleFrame(
      { index: 0, width: 2, height: 1, pixels: new Uint8Array([0, 255, 0, 255, 0, 0]) },
      1,
      1,
      new Float32Array([0, 1]),
    )
    expect([...sampled.pixels]).toEqual([255, 0, 0])
    expect([...sampled.mask!]).toEqual([0.5])
  })
  it('detects change, preserves a paused mask, resets on seek and does not leak streams', () => {
    const motion = new MotionMask()
    const frame = { index: 0, streamId: 'a', width: 3, height: 3, pixels: new Uint8Array(27) }
    expect(motion.mask(frame, defaults).every((v) => v === 0)).toBe(true)
    const moving = { ...frame, index: 1, pixels: new Uint8Array(27).fill(255) }
    const mask = motion.mask(moving, defaults)
    expect(mask.every((v) => v === 1)).toBe(true)
    expect(motion.mask(moving, defaults)).toEqual(mask)
    expect(motion.mask(frame, defaults).every((v) => v === 0)).toBe(true)
    expect(motion.mask({ ...moving, streamId: 'b' }, defaults).every((v) => v === 0)).toBe(true)
  })
  it('restores only known modes and valid key colors', () => {
    const saved = restoreSettings(
      '{"background":"erase-everything","keyColor":"invalid","maskThreshold":4}',
    )
    expect(saved.background).toBe('none')
    expect(saved.keyColor).toBe(defaults.keyColor)
    expect(saved.maskThreshold).toBe(0.9)
  })
})
