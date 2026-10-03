import type { DesktopAPI, ExportFormat, Media, Settings } from '../types'
import type { AsciiPool } from './pool'

const htmlHeader = (fps: number, width: number) =>
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ASCII Motion Studio — export</title><style>*{box-sizing:border-box}body{margin:0;background:#090c10;color:#dbe1ea;min-height:100vh;display:grid;place-content:center;font-family:monospace}pre{font-family:'Courier New',monospace;font-size:clamp(2px,${160 / width}vw,14px);line-height:1.15;margin:20px auto;white-space:pre}button{display:block;margin:auto;padding:10px 24px;background:#1b2530;color:#b6f284;border:1px solid #354535;border-radius:8px}footer{text-align:center;color:#7e8996;padding:20px}</style><pre id="screen" aria-label="Animação ASCII"></pre><button id="toggle">Pausar</button><footer>ASCII Motion Studio</footer><script>const fps=${fps};const frames=[`
const htmlFooter = `];let playing=true,position=0,last=performance.now();const screen=document.getElementById('screen'),button=document.getElementById('toggle');function tick(now){if(playing&&frames.length){position+=(now-last)*fps/1000;screen.innerHTML=frames[Math.floor(position)%frames.length]}last=now;requestAnimationFrame(tick)}button.onclick=()=>{playing=!playing;button.textContent=playing?'Pausar':'Reproduzir'};screen.innerHTML=frames[0]||'';requestAnimationFrame(tick);</script></html>`

/** Streams every frame to disk/encoder; never collects the complete animation in RAM. */
export async function exportMedia(
  api: DesktopAPI,
  pool: AsciiPool,
  media: Media,
  settings: Settings,
  format: ExportFormat,
  speed: number,
  signal: AbortSignal,
  progress: (fraction: number) => void,
) {
  const fps = media.fps * speed
  const job = await api.exportStart(
    format,
    media.name,
    fps,
    settings.width * 8,
    settings.height * 15,
  )
  if (!job) return null
  let decoder: string | undefined
  try {
    decoder = await api.decoder(media.id, settings.width, settings.height, 0)
    if (format === 'html') await api.exportWrite(job, htmlHeader(fps, settings.width))
    let count = 0
    while (!signal.aborted) {
      const raw = await api.next(decoder)
      if (!raw) break
      const frame = await pool.convert(
        raw,
        settings,
        1,
        format === 'html',
        format === 'mp4' || format === 'gif',
      )
      if (format === 'html')
        await api.exportWrite(
          job,
          (count ? ',' : '') + JSON.stringify(frame.html).replace(/</g, '\\u003c'),
        )
      else if (format === 'txt')
        await api.exportWrite(job, `${count ? '\n\f\n' : ''}${frame.text}\n`)
      else {
        if (!frame.png) throw new Error('Falha ao rasterizar frame no worker.')
        await api.exportWrite(job, frame.png)
      }
      count++
      progress(media.still ? 1 : Math.min(0.99, count / Math.max(1, media.duration * media.fps)))
    }
    if (signal.aborted) {
      await api.exportFinish(job, true)
      return null
    }
    if (count === 0) throw new Error('Nenhum frame disponível para exportar.')
    if (format === 'html') await api.exportWrite(job, htmlFooter)
    const path = await api.exportFinish(job)
    progress(1)
    return path
  } catch (error) {
    await api.exportFinish(job, true).catch(() => {})
    throw error
  } finally {
    if (decoder) await api.close(decoder)
  }
}
