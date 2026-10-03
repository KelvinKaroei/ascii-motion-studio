import type { AsciiFrame } from '../types'

/** Rasterization lives in the export worker, keeping fillText and PNG encoding off the UI. */
export async function rasterize(frame: AsciiFrame): Promise<Uint8Array> {
  const cw = 8,
    ch = 15
  const canvas = new OffscreenCanvas(frame.width * cw, frame.height * ch)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#090c10'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.font = '13px "Courier New", monospace'
  ctx.textBaseline = 'top'
  for (let i = 0; i < frame.chars.length; i++) {
    const p = i * 3
    ctx.fillStyle = `rgb(${frame.colors[p]},${frame.colors[p + 1]},${frame.colors[p + 2]})`
    ctx.fillText(frame.chars[i], (i % frame.width) * cw, Math.floor(i / frame.width) * ch)
  }
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
}
