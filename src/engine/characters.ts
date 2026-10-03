export const characterPresets = [
  { label: 'Padrão', chars: ' .,:;i1tfLCG08@' },
  {
    label: 'Fotográfico',
    chars: ' .`^",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  },
  { label: 'Letras', chars: ' .abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { label: 'Números', chars: ' .0123456789' },
  {
    label: 'Alfanumérico',
    chars: ' .0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  },
  {
    label: 'ASCII completo',
    chars: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(''),
  },
  { label: 'Blocos', chars: ' ░▒▓█' },
  { label: 'Binário', chars: ' 01' },
  { label: 'Minimal', chars: ' .:-=+*#%@' },
]

/** Cache glyph ink coverage in the same monospace font used by the preview. */
export class GlyphRamp {
  private key = ''
  private sorted: string[] = []
  order(chars: string[]) {
    const key = chars.join('')
    if (key === this.key) return this.sorted
    const canvas = new OffscreenCanvas(24, 32)
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.font = '24px "Courier New", monospace'
    context.textBaseline = 'top'
    const entries = [...new Set(chars)].map((char) => {
      context.clearRect(0, 0, 24, 32)
      context.fillStyle = '#ffffff'
      context.fillText(char, 0, 0)
      const pixels = context.getImageData(0, 0, 24, 32).data
      let ink = 0
      for (let i = 3; i < pixels.length; i += 4) ink += pixels[i]
      return { char, ink }
    })
    this.key = key
    this.sorted = entries.sort((a, b) => a.ink - b.ink).map((entry) => entry.char)
    return this.sorted
  }
}
