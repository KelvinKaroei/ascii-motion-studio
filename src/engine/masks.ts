import type { Frame, Settings } from '../types'

export function softThreshold(value: number, threshold: number, feather: number) {
  if (feather <= 0) return value >= threshold ? 1 : 0
  const t = Math.max(0, Math.min(1, (value - threshold + feather / 2) / feather))
  return t * t * (3 - 2 * t)
}

export function chromaMask(frame: Frame, settings: Settings) {
  const key = [1, 3, 5].map((index) => parseInt(settings.keyColor.slice(index, index + 2), 16))
  const mask = new Float32Array(frame.width * frame.height)
  for (let i = 0; i < mask.length; i++) {
    const p = i * 3
    const distance =
      Math.sqrt(
        (frame.pixels[p] - key[0]) ** 2 +
          (frame.pixels[p + 1] - key[1]) ** 2 +
          (frame.pixels[p + 2] - key[2]) ** 2,
      ) / 441.673
    mask[i] = softThreshold(distance, settings.keyTolerance, settings.feather)
  }
  return mask
}

/** Temporal difference, not semantic person detection. State is isolated per stream/worker. */
export class MotionMask {
  private previous?: Uint8Array
  private scores = new Float32Array(0)
  private stream = ''
  private index = -1
  mask(frame: Frame, settings: Settings) {
    const size = frame.width * frame.height
    const stream = `${frame.streamId}:${frame.width}:${frame.height}`
    if (stream !== this.stream || frame.index < this.index || !this.previous) {
      this.previous = new Uint8Array(frame.pixels)
      this.scores = new Float32Array(size)
      this.stream = stream
      this.index = frame.index
    } else if (frame.index !== this.index) {
      const decay = Math.pow(0.83, Math.max(1, frame.index - this.index))
      for (let i = 0; i < size; i++) {
        const p = i * 3
        const difference =
          Math.max(
            Math.abs(frame.pixels[p] - this.previous[p]),
            Math.abs(frame.pixels[p + 1] - this.previous[p + 1]),
            Math.abs(frame.pixels[p + 2] - this.previous[p + 2]),
          ) / 255
        this.scores[i] = Math.max(difference, this.scores[i] * decay)
      }
      this.previous.set(frame.pixels)
      this.index = frame.index
    }
    const result = new Float32Array(size)
    const threshold = 0.015 + (1 - settings.motionSensitivity) * 0.3
    for (let y = 0; y < frame.height; y++)
      for (let x = 0; x < frame.width; x++) {
        let value = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy
            if (nx >= 0 && nx < frame.width && ny >= 0 && ny < frame.height)
              value = Math.max(value, this.scores[ny * frame.width + nx])
          }
        result[y * frame.width + x] = softThreshold(value, threshold, settings.feather * 0.15)
      }
    return result
  }
}

/** Area sampling keeps masked-out background colors from leaking into the foreground. */
export function sampleFrame(frame: Frame, width: number, height: number, mask?: Float32Array) {
  const pixels = new Uint8Array(width * height * 3)
  const coverage = mask ? new Float32Array(width * height) : undefined
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * frame.width) / width),
        x1 = Math.max(x0 + 1, Math.floor(((x + 1) * frame.width) / width))
      const y0 = Math.floor((y * frame.height) / height),
        y1 = Math.max(y0 + 1, Math.floor(((y + 1) * frame.height) / height))
      let r = 0,
        g = 0,
        b = 0,
        weight = 0,
        count = 0
      for (let sy = y0; sy < Math.min(y1, frame.height); sy++)
        for (let sx = x0; sx < Math.min(x1, frame.width); sx++) {
          const i = sy * frame.width + sx,
            alpha = mask ? mask[i] : 1
          r += frame.pixels[i * 3] * alpha
          g += frame.pixels[i * 3 + 1] * alpha
          b += frame.pixels[i * 3 + 2] * alpha
          weight += alpha
          count++
        }
      const target = y * width + x
      if (weight > 0)
        pixels.set(
          [Math.round(r / weight), Math.round(g / weight), Math.round(b / weight)],
          target * 3,
        )
      if (coverage) coverage[target] = count ? weight / count : 0
    }
  return { pixels, mask: coverage }
}
