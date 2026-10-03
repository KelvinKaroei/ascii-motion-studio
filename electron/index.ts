import { app, BrowserWindow, dialog, ipcMain, protocol, net } from 'electron'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createWriteStream, type WriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { Decoder, ffmpeg, inspect, sources } from './media'
import type { ExportFormat } from '../src/types'

// A same-origin local scheme lets workers fetch WASM/models without opening file access.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'studio',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])

const decoders = new Map<string, Decoder>()
interface ExportJob {
  path: string
  temp: string
  stream: WriteStream | ChildProcessWithoutNullStreams['stdin']
  process?: ChildProcessWithoutNullStreams
  done: Promise<void>
  error?: Error
}
const jobs = new Map<string, ExportJob>()
let window: BrowserWindow
const validNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error('Parâmetro fora do intervalo.')
  return value
}
function handle(name: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(name, (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Origem não autorizada.')
    return fn(...args)
  })
}
function register() {
  handle('media:pick', async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [
        {
          name: 'Imagens e vídeos',
          extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'gif', 'png', 'jpg', 'jpeg', 'webp'],
        },
      ],
    })
    return result.canceled ? null : inspect(result.filePaths[0])
  })
  handle('media:open', inspect)
  handle('decode:open', (mediaId: string, width: number, height: number, start: number) => {
    const source = sources.get(mediaId)
    if (!source) throw new Error('Arquivo não disponível. Importe novamente.')
    if (decoders.size >= 4) throw new Error('Limite de decodificadores atingido.')
    validNumber(width, 24, 300)
    validNumber(height, 8, 160)
    validNumber(start, 0, 864000)
    const id = randomUUID()
    const longestSide = Math.max(256, width)
    const aspect = source.meta.width / source.meta.height
    const sampleWidth = Math.max(24, Math.round(longestSide * Math.min(1, aspect)))
    const sampleHeight = Math.max(8, Math.round(longestSide * Math.min(1, 1 / aspect)))
    decoders.set(id, new Decoder(source.path, sampleWidth, sampleHeight, start, source.meta.fps))
    return id
  })
  handle('decode:next', async (id: string) => {
    const frame = await decoders.get(id)?.next()
    return frame ? { ...frame, streamId: id } : null
  })
  handle('decode:close', (id: string) => {
    decoders.get(id)?.close()
    decoders.delete(id)
  })
  handle(
    'export:open',
    async (format: ExportFormat, name: string, fps: number, width: number, height: number) => {
      if (!['mp4', 'gif', 'html', 'txt'].includes(format) || jobs.size)
        throw new Error('Exportação indisponível.')
      validNumber(fps, 0.25, 240)
      validNumber(width, 1, 4000)
      validNumber(height, 1, 4000)
      const result = await dialog.showSaveDialog(window, {
        defaultPath: `${name.replace(/\.[^.]+$/, '')}-ascii.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      })
      if (result.canceled || !result.filePath) return null
      const id = randomUUID(),
        path = result.filePath,
        temp = `${path}.${id}.partial`
      let job: ExportJob
      if (format === 'mp4' || format === 'gif') {
        const args = [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'image2pipe',
          '-framerate',
          String(fps),
          '-vcodec',
          'png',
          '-i',
          'pipe:0',
          '-an',
        ]
        if (format === 'mp4')
          args.push(
            '-vf',
            'pad=ceil(iw/2)*2:ceil(ih/2)*2',
            '-c:v',
            'libx264',
            '-preset',
            'fast',
            '-crf',
            '18',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            '-f',
            'mp4',
          )
        else
          args.push(
            '-vf',
            'split[a][b];[a]palettegen=stats_mode=single[p];[b][p]paletteuse=new=1',
            '-loop',
            '0',
            '-f',
            'gif',
          )
        const process = spawn(ffmpeg(), [...args, temp], { windowsHide: true })
        let error = ''
        process.stderr.on('data', (chunk) => {
          error = (error + chunk).slice(-2000)
        })
        process.stdout.resume()
        const done = new Promise<void>((resolve, reject) => {
          process.on('error', reject)
          process.on('close', (code) =>
            code === 0 ? resolve() : reject(new Error(error || 'Falha na exportação FFmpeg.')),
          )
        })
        job = { path, temp, process, stream: process.stdin, done }
      } else {
        const stream = createWriteStream(temp)
        const done = new Promise<void>((resolve, reject) => {
          stream.on('finish', resolve)
          stream.on('close', resolve)
          stream.on('error', reject)
        })
        job = { path, temp, stream, done }
      }
      job.stream.on('error', (e: Error) => {
        job.error = e
      })
      job.done.catch((e) => {
        job.error = e
      })
      jobs.set(id, job)
      return id
    },
  )
  handle('export:write', async (id: string, data: Uint8Array | string) => {
    const job = jobs.get(id)
    if (!job) throw new Error('Exportação não encontrada.')
    if (job.error) throw job.error
    if ((typeof data === 'string' ? data.length : data.byteLength) > 16_000_000)
      throw new Error('Frame muito grande.')
    await new Promise<void>((resolve, reject) => {
      job.stream.write(typeof data === 'string' ? data : Buffer.from(data), (error) =>
        error ? reject(error) : resolve(),
      )
    })
  })
  handle('export:finish', async (id: string, cancel = false) => {
    const job = jobs.get(id)
    if (!job) return ''
    try {
      if (cancel) {
        job.process?.kill()
        job.stream.destroy()
        await job.done.catch(() => {})
        return ''
      }
      job.stream.end()
      await job.done
      if (job.error) throw job.error
      await rename(job.temp, job.path)
      return job.path
    } finally {
      jobs.delete(id)
      await rm(job.temp, { force: true }).catch(() => {})
    }
  })
}
app.whenReady().then(() => {
  const rendererRoot = resolve(__dirname, '../renderer')
  protocol.handle('studio', (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'app' || request.method !== 'GET')
      return new Response('Not found', { status: 404 })
    const path = resolve(rendererRoot, '.' + decodeURIComponent(url.pathname))
    if (!path.startsWith(rendererRoot + sep)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(path).href)
  })
  const smoke = process.env.ASCII_STUDIO_SMOKE === '1'
  window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1040,
    minHeight: 720,
    show: !smoke,
    backgroundColor: '#0b0d10',
    title: 'ASCII Motion Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: smoke,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (e) => e.preventDefault())
  register()
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadURL('studio://app/index.html')
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  for (const decoder of decoders.values()) decoder.close()
  for (const job of jobs.values()) {
    job.process?.kill()
    job.stream.destroy()
    void rm(job.temp, { force: true }).catch(() => {})
  }
})
