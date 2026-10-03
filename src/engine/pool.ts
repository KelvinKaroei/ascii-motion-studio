import type { AsciiFrame, Frame, Settings } from '../types'
/** Two workers allow live playback and offline export to progress independently. */
export class AsciiPool {
  private assets = new URL('vision', document.baseURI).href.replace(/\/$/, '')
  private workers = [
    new Worker(new URL('./ascii.worker.ts', import.meta.url), { type: 'module' }),
    new Worker(new URL('./ascii.worker.ts', import.meta.url), { type: 'module' }),
  ]
  private serial = 0
  private pending = new Map<
    number,
    { resolve: (frame: AsciiFrame) => void; reject: (error: Error) => void }
  >()
  constructor() {
    for (const worker of this.workers) {
      worker.onmessage = ({ data }) => {
        const job = this.pending.get(data.id)
        this.pending.delete(data.id)
        if (data.error) job?.reject(new Error(data.error))
        else job?.resolve(data.result)
      }
      worker.onerror = (event) => {
        for (const job of this.pending.values()) job.reject(new Error(event.message))
        this.pending.clear()
      }
    }
  }
  convert(frame: Frame, settings: Settings, lane = 0, includeHtml = false, raster = false) {
    const id = ++this.serial
    return new Promise<AsciiFrame>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      // Copy is intentional: the bounded raw-frame cache retains the source for live edits.
      const pixels = new Uint8Array(frame.pixels)
      this.workers[lane].postMessage(
        {
          id,
          pixels,
          index: frame.index,
          streamId: frame.streamId,
          width: frame.width,
          height: frame.height,
          settings,
          includeHtml,
          raster,
          assets: this.assets,
        },
        [pixels.buffer],
      )
    })
  }
  dispose() {
    for (const worker of this.workers) worker.terminate()
    for (const job of this.pending.values()) job.reject(new Error('Worker encerrado.'))
    this.pending.clear()
  }
}

/** LRU measured in raw bytes, with a hard entry cap. Stores pixels, never large ANSI strings. */
export class FrameCache {
  private entries = new Map<string, Frame>()
  bytes = 0
  constructor(private budget = 12 * 1024 * 1024) {}
  get(key: string) {
    const frame = this.entries.get(key)
    if (frame) {
      this.entries.delete(key)
      this.entries.set(key, frame)
    }
    return frame
  }
  set(key: string, frame: Frame) {
    const old = this.entries.get(key)
    if (old) this.bytes -= old.pixels.byteLength
    this.entries.delete(key)
    this.entries.set(key, frame)
    this.bytes += frame.pixels.byteLength
    while (this.bytes > this.budget || this.entries.size > 180) {
      const first = this.entries.keys().next().value!
      this.bytes -= this.entries.get(first)!.pixels.byteLength
      this.entries.delete(first)
    }
  }
  clear() {
    this.entries.clear()
    this.bytes = 0
  }
}
