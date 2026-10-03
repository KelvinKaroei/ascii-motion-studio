import { convert, defaults } from './ascii'
import type { Settings } from '../types'
/** Procedural orbital study; ships without external assets or network dependencies. */
export function demoFrame(phase = 0, settings: Settings = defaults) {
  const { width, height } = settings,
    pixels = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const nx = (x - width / 2) / (width / 5),
        ny = (y - height / 2) / (height / 3.23)
      const rotatedX = nx * 0.92 + ny * 0.38,
        rotatedY = -nx * 0.38 + ny * 0.92
      const radius = Math.sqrt(rotatedX ** 2 + (rotatedY * 2.8) ** 2)
      const ring = Math.exp(-((radius - 1.65) ** 2) * 24)
      const sphere = nx * nx + ny * ny < 0.78 ? Math.sqrt(1 - (nx * nx + ny * ny) / 0.78) : 0
      const texture = 0.65 + 0.35 * Math.sin(nx * 17 + ny * 12 + phase)
      const value = Math.min(
        1,
        Math.max(ring * texture, sphere * (0.5 + 0.5 * Math.sin(ny * 20 + nx * 4 + phase))),
      )
      const i = (y * width + x) * 3
      pixels[i] = value * 155
      pixels[i + 1] = value * 219
      pixels[i + 2] = value * 105
    }
  return convert(pixels, width, height, settings)
}
