import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'
import ffprobe from '@ffprobe-installer/ffprobe'
import type { Frame, Media } from '../src/types'

export const binary = (path: string) => path.replace('app.asar', 'app.asar.unpacked')
export const ffmpeg = () => binary(process.env.FFMPEG_PATH || ffmpegPath || 'ffmpeg')
const allowed = new Set([
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.gif',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
])
export const sources = new Map<string, { path: string; meta: Media }>()

export async function inspect(path: string): Promise<Media> {
  if (typeof path !== 'string' || !allowed.has(extname(path).toLowerCase()))
    throw new Error('Formato não suportado. Use vídeo, GIF ou imagem.')
  const info = await stat(path)
  if (!info.isFile()) throw new Error('Selecione um arquivo de mídia.')
  const probe = spawn(
    binary(process.env.FFPROBE_PATH || ffprobe.path),
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path],
    { windowsHide: true },
  )
  let output = '',
    error = ''
  const timeout = setTimeout(() => probe.kill(), 15000)
  probe.stdout.on('data', (chunk) => {
    output += chunk
    if (output.length > 2_000_000) probe.kill()
  })
  probe.stderr.on('data', (chunk) => {
    error = (error + chunk).slice(-2000)
  })
  try {
    await new Promise<void>((resolve, reject) => {
      probe.on('error', reject)
      probe.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(error || 'Não foi possível ler a mídia.')),
      )
    })
  } finally {
    clearTimeout(timeout)
  }
  const data = JSON.parse(output)
  const stream = data.streams.find((s: { codec_type: string }) => s.codec_type === 'video')
  if (!stream) throw new Error('O arquivo não contém imagem ou vídeo.')
  const [num, den] = String(stream.avg_frame_rate || stream.r_frame_rate || '30/1')
    .split('/')
    .map(Number)
  const duration = Number(stream.duration || data.format.duration) || 0
  const extension = extname(path).toLowerCase()
  const still =
    ['.png', '.jpg', '.jpeg'].includes(extension) || (extension === '.webp' && duration === 0)
  const meta: Media = {
    id: randomUUID(),
    name: basename(path),
    format: extname(path).slice(1).toUpperCase(),
    width: stream.width,
    height: stream.height,
    fps: Math.min(120, Math.max(1, num / den || 30)),
    duration: still ? 0 : duration,
    still,
    size: info.size,
  }
  // Keep only recent source capabilities, never arbitrary renderer-supplied output paths.
  if (sources.size >= 12) sources.delete(sources.keys().next().value!)
  sources.set(meta.id, { path, meta })
  return meta
}

/** Pull-based rawvideo reader. Node stream backpressure bounds memory regardless of duration. */
export class Decoder {
  readonly process: ChildProcessWithoutNullStreams
  private iterator: AsyncIterator<Buffer>
  private remainder: Buffer = Buffer.alloc(0)
  private index = 0
  private busy = false
  private error = ''
  private exitCode: number | null = null
  private closed = false
  constructor(
    path: string,
    readonly width: number,
    readonly height: number,
    start: number,
    fps: number,
  ) {
    this.process = spawn(
      ffmpeg(),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-threads',
        '2',
        ...(start > 0 ? ['-ss', String(start)] : []),
        '-i',
        path,
        '-an',
        '-sn',
        '-vf',
        `fps=${fps},scale=${width}:${height}:flags=area`,
        '-threads',
        '2',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        'pipe:1',
      ],
      { windowsHide: true },
    )
    this.process.stderr.on('data', (chunk) => {
      this.error = (this.error + chunk).slice(-2000)
    })
    this.process.on('error', (e) => {
      this.error = e.message
    })
    this.process.on('close', (code) => {
      this.exitCode = code
    })
    this.iterator = this.process.stdout[Symbol.asyncIterator]()
  }
  async next(): Promise<Frame | null> {
    if (this.busy) throw new Error('Leitura de frame já em andamento.')
    if (this.closed) return null
    this.busy = true
    try {
      const size = this.width * this.height * 3
      const frame = Buffer.allocUnsafe(size)
      let offset = 0
      while (offset < size) {
        if (!this.remainder.length) {
          const chunk = await this.iterator.next()
          if (chunk.done) {
            if (this.error || (this.exitCode !== null && this.exitCode !== 0))
              throw new Error(this.error || 'FFmpeg interrompeu a decodificação.')
            return null
          }
          this.remainder = chunk.value
        }
        const count = Math.min(size - offset, this.remainder.length)
        this.remainder.copy(frame, offset, 0, count)
        this.remainder = this.remainder.subarray(count)
        offset += count
      }
      return {
        index: this.index++,
        pixels: new Uint8Array(frame),
        width: this.width,
        height: this.height,
      }
    } finally {
      this.busy = false
    }
  }
  close() {
    this.closed = true
    this.process.kill()
    this.process.stdout.destroy()
    this.remainder = Buffer.alloc(0)
  }
}
