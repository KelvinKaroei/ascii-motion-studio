import { convert, safeCharacters } from './ascii'
import { rasterize } from './raster'
import { GlyphRamp } from './characters'
import { chromaMask, MotionMask, sampleFrame } from './masks'
import { PersonMask } from './person'
import type { Frame, Settings } from '../types'

interface Request extends Frame {
  id: number
  settings: Settings
  includeHtml: boolean
  raster: boolean
  assets: string
}
const motion = new MotionMask(),
  person = new PersonMask(),
  glyphs = new GlyphRamp()
let queue = Promise.resolve()

async function processFrame(data: Request) {
  const { id, settings, includeHtml, raster, assets } = data
  try {
    const started = performance.now()
    let mask: Float32Array | undefined
    if (settings.background === 'person') mask = await person.mask(data, settings, assets)
    else if (settings.background === 'chroma') mask = chromaMask(data, settings)
    else if (settings.background === 'motion') mask = motion.mask(data, settings)
    const sampled = sampleFrame(data, settings.width, settings.height, mask)
    const ordered = settings.sortCharacters
      ? glyphs.order(safeCharacters(settings.chars))
      : undefined
    const result = convert(
      sampled.pixels,
      settings.width,
      settings.height,
      settings,
      includeHtml,
      sampled.mask,
      ordered,
    )
    result.ms = performance.now() - started
    if (raster) result.png = await rasterize(result)
    self.postMessage(
      { id, result },
      { transfer: result.png ? [result.colors.buffer, result.png.buffer] : [result.colors.buffer] },
    )
  } catch (error) {
    self.postMessage({ id, error: String(error) })
  }
}

// Seek and rapid setting changes can overlap requests; masks stay sequential per worker.
self.onmessage = (event: MessageEvent<Request>) => {
  queue = queue.then(() => processFrame(event.data))
}
