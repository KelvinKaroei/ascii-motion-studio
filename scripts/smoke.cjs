/* Run after npm run build: node scripts/run-smoke.cjs. Uses real Electron + FFmpeg. */
const { app, BrowserWindow, dialog } = require('electron')
const { resolve } = require('node:path')
const { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const { spawnSync } = require('node:child_process')
app.disableHardwareAcceleration()
process.env.ASCII_STUDIO_SMOKE = '1'
const output = resolve('.tmp/smoke')
mkdirSync(output, { recursive: true })
app.setPath('userData', resolve(output, 'electron-profile'))
setTimeout(() => {
  console.error('SMOKE global timeout')
  app.exit(1)
}, 180000).unref()
const ffmpeg = require('ffmpeg-static')
const fixture = resolve(output, 'source.mp4')
const result = spawnSync(
  ffmpeg,
  [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=12:duration=2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    fixture,
  ],
  { windowsHide: true },
)
if (result.status !== 0) throw new Error(String(result.stderr))
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] })
let destination = ''
dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination })
require('../out/main/index.js')
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('did-finish-load', () => console.log('SMOKE renderer loaded'))
  window.webContents.on('did-fail-load', (_event, code, description) =>
    console.error('LOAD FAILED', code, description),
  )
  window.webContents.on('render-process-gone', (_event, details) =>
    console.error('RENDERER GONE', details),
  )
})
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(window, expression, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await window.webContents.executeJavaScript(expression)) return
    await pause(150)
  }
  throw new Error(`Timeout: ${expression}`)
}
app.whenReady().then(async () => {
  console.log('SMOKE app ready')
  try {
    await pause(1500)
    const window = BrowserWindow.getAllWindows()[0]
    window.hide()
    window.webContents.setBackgroundThrottling(false)
    const errors = []
    window.webContents.on('console-message', (event) => {
      if (event.level === 'error') {
        errors.push(event.message)
        console.error('RENDERER ERROR', event.message)
      }
    })
    await waitFor(window, '!!document.querySelector(".dropzone") && !!window.studio')
    console.log('SMOKE UI ready')
    await pause(800)
    writeFileSync(
      resolve(output, 'welcome.png'),
      (
        await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
      ).toPNG(),
    )
    console.log('SMOKE welcome captured')
    await window.webContents.executeJavaScript('document.querySelector(".dropzone").click()')
    console.log('SMOKE import requested')
    await waitFor(
      window,
      'document.querySelector(".terminal-tab").textContent.includes("source.mp4") && !document.querySelector(".loading-overlay")',
    )
    await pause(500)
    console.log('SMOKE auto playback ready')
    await window.webContents.executeJavaScript(
      `document.querySelector('button[aria-label="Pausar"]')?.click()`,
    )
    writeFileSync(
      resolve(output, 'playback.png'),
      (
        await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
      ).toPNG(),
    )
    await window.webContents.executeJavaScript(
      `document.querySelector('button[aria-label="Comparação lado a lado"]').click()`,
    )
    await waitFor(window, 'document.querySelector(".original-panel canvas")?.width > 0')
    await pause(250)
    writeFileSync(
      resolve(output, 'comparison.png'),
      (
        await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
      ).toPNG(),
    )
    for (const format of ['mp4', 'gif', 'html', 'txt']) {
      destination = resolve(output, `export.${format}`)
      await window.webContents.executeJavaScript('document.querySelector(".export-button").click()')
      await waitFor(window, '!!document.querySelector(".export-options")')
      await window.webContents.executeJavaScript(
        `Array.from(document.querySelectorAll('.export-options button')).find(b=>b.textContent.startsWith(${JSON.stringify(format.toUpperCase())})).click()`,
      )
      await window.webContents.executeJavaScript(
        'document.querySelector(".modal .primary").click()',
      )
      await waitFor(window, '!document.querySelector(".modal")', 120000)
      if (!existsSync(destination)) throw new Error(`Missing export ${format}`)
      if (format === 'txt' && readFileSync(destination, 'utf8').split('\f').length !== 24)
        throw new Error('TXT frame count mismatch')
      if (format === 'html') {
        const html = readFileSync(destination, 'utf8')
        const script = html.match(/<script>([\s\S]*)<\/script>/)[1]
        const elements = new Map()
        const count = runInNewContext(script + ';frames.length', {
          performance: { now: () => 0 },
          requestAnimationFrame: () => {},
          document: {
            getElementById: (id) => {
              if (!elements.has(id)) elements.set(id, {})
              return elements.get(id)
            },
          },
        })
        if (count !== 24 || !elements.get('screen').innerHTML)
          throw new Error('HTML player did not initialize 24 frames')
      }
      if (format === 'mp4' || format === 'gif') {
        const probe = spawnSync(
          require('@ffprobe-installer/ffprobe').path,
          [
            '-v',
            'error',
            '-count_frames',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=nb_read_frames,width,height',
            '-of',
            'json',
            destination,
          ],
          { windowsHide: true },
        )
        const stream = JSON.parse(probe.stdout).streams[0]
        if (Number(stream.nb_read_frames) !== 24)
          throw new Error(`Expected 24 frames in ${format}: ${probe.stdout}`)
      }
      console.log(`PASS export ${format}`)
    }
    for (const format of ['mp4', 'txt']) {
      destination = resolve(output, `cancelled.${format}`)
      await window.webContents.executeJavaScript(
        `(async()=>{const id=await window.studio.exportStart('${format}','cancelled',12,960,510);await window.studio.exportFinish(id,true)})()`,
      )
      if (
        existsSync(destination) ||
        readdirSync(output).some((name) => name.startsWith(`cancelled.${format}.`))
      )
        throw new Error('Cancellation left an output file')
      console.log(`PASS cancellation ${format}`)
    }
    if (errors.length) throw new Error(errors.join('\n'))
    console.log('PASS Electron import, auto playback, PNG capture, MP4/GIF/HTML/TXT exports')
    app.quit()
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
