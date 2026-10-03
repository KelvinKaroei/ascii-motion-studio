import { describe, expect, it } from 'vitest'
import { convert, defaults, escapeHtml, palette256, safeCharacters } from '../src/engine/ascii'
import { FrameCache } from '../src/engine/pool'
import { restoreSettings } from '../src/engine/settings'

describe('ASCII conversion', () => {
  it('maps black and white to the ends of the character ramp', () => {
    const frame = convert(new Uint8Array([0, 0, 0, 255, 255, 255]), 2, 1, {
      ...defaults,
      chars: ' .#',
    })
    expect(frame.text).toBe(' #')
    expect(frame.ansi).toContain('\x1b[38;2;255;255;255m')
    expect(frame.chars).toHaveLength(2)
  })
  it('never accepts terminal control sequences or double-width characters', () => {
    expect(safeCharacters('\x1b\n\t😀界░█a')).toEqual(['░', '█', 'a'])
  })
  it('escapes custom text for standalone HTML', () => {
    expect(escapeHtml('<script>"&')).toBe('&lt;script&gt;&quot;&amp;')
    expect(
      convert(new Uint8Array([255, 255, 255]), 1, 1, { ...defaults, chars: '<' }, true).html,
    ).toContain('&lt;')
  })
  it('uses exact ANSI colors and grey ramp where appropriate', () => {
    expect(palette256(255, 0, 0)).toEqual([196, 255, 0, 0])
    expect(palette256(128, 128, 128)).toEqual([244, 128, 128, 128])
    expect(
      convert(new Uint8Array([255, 0, 0]), 1, 1, { ...defaults, color: 'ansi256' }).ansi,
    ).toContain('[38;5;196m')
  })
  it('applies presets consistently to terminal and raster output', () => {
    const frame = convert(
      new Uint8Array([255, 255, 255]),
      1,
      1,
      { ...defaults, style: 'retro' },
      true,
    )
    expect([...frame.colors]).toEqual([255, 188, 97])
    expect(frame.html).toContain('rgb(255,188,97)')
  })
  it('handles empty ramps and emits exact rows', () => {
    const frame = convert(new Uint8Array(18), 3, 2, { ...defaults, chars: '' })
    expect(frame.text.split('\n').map((row) => row.length)).toEqual([3, 3])
  })
})
describe('bounded raw frame cache', () => {
  it('evicts least recently used frames without exceeding byte budget', () => {
    const cache = new FrameCache(6)
    const frame = { width: 1, height: 1, index: 0, pixels: new Uint8Array(3) }
    cache.set('a', frame)
    cache.set('b', frame)
    cache.get('a')
    cache.set('c', frame)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBeDefined()
    expect(cache.bytes).toBe(6)
    cache.clear()
    expect(cache.bytes).toBe(0)
  })
})
describe('persisted settings', () => {
  it('recovers from invalid JSON, unknown modes and non-string ramps', () => {
    expect(restoreSettings('{')).toEqual(defaults)
    expect(restoreSettings('null')).toEqual(defaults)
    expect(restoreSettings('{"color":"invalid","chars":null,"density":99}')).toEqual({
      ...defaults,
      density: 2.5,
    })
  })
})
