/* Offline after the official sample portrait has been downloaded once. */
const { app, BrowserWindow, dialog } = require('electron')
const { resolve } = require('node:path')
const { mkdirSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const output = resolve('.tmp/vision-smoke')
mkdirSync(output, { recursive: true })
app.disableHardwareAcceleration()
app.setPath('userData', resolve(output, 'profile'))
process.env.ASCII_STUDIO_SMOKE = '1'
const portrait = resolve('.tmp/portrait.jpg')
let selectedFile = portrait
let destination = ''
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFile] })
dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination })
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
setTimeout(() => {
  console.error('VISION timeout')
  app.exit(1)
}, 180000).unref()
async function waitFor(window, expression, timeout = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const error = await window.webContents.executeJavaScript(
      'document.querySelector(".toast.error")?.textContent || ""',
    )
    if (error) throw new Error(error)
    if (await window.webContents.executeJavaScript(expression)) return
    await pause(100)
  }
  throw new Error('Timeout: ' + expression)
}
async function main() {
  if (!existsSync(portrait)) {
    const response = await fetch('https://storage.googleapis.com/mediapipe-assets/portrait.jpg')
    if (!response.ok) throw new Error('Official portrait fixture unavailable')
    writeFileSync(portrait, Buffer.from(await response.arrayBuffer()))
  }
  require('../out/main/index.js')
  await app.whenReady()
  await pause(1800)
  const window = BrowserWindow.getAllWindows()[0]
  window.webContents.setBackgroundThrottling(false)
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.error('VISION RENDERER:', event.message)
  })
  await waitFor(window, '!!document.querySelector(".dropzone")')
  await window.webContents.executeJavaScript(
    `document.querySelector('button[aria-label="Restaurar ajustes"]').click()`,
  )
  await waitFor(
    window,
    `document.querySelector('select[aria-label="Remover fundo"]').value === 'none'`,
  )
  await window.webContents.executeJavaScript('document.querySelector(".dropzone").click()')
  await waitFor(
    window,
    'document.querySelector(".terminal-tab").textContent.includes("portrait") && !document.querySelector(".loading-overlay")',
  )
  async function exportTxt(name) {
    destination = resolve(output, name)
    await window.webContents.executeJavaScript('document.querySelector(".export-button").click()')
    await waitFor(window, '!!document.querySelector(".export-options")')
    await window.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.export-options button')).find(b=>b.textContent.startsWith('TXT')).click()`,
    )
    await window.webContents.executeJavaScript('document.querySelector(".modal .primary").click()')
    await waitFor(window, '!document.querySelector(".modal")')
    return readFileSync(destination, 'utf8')
  }
  const original = await exportTxt('original.txt')
  await window.webContents.executeJavaScript(
    `const select=document.querySelector('select[aria-label="Remover fundo"]');select.value='person';select.dispatchEvent(new Event('change',{bubbles:true}))`,
  )
  const cut = await exportTxt('person.txt')
  const ink = (text) => [...text].filter((c) => !/\s/.test(c)).length
  if (ink(cut) < 100 || ink(cut) >= ink(original) * 0.95)
    throw new Error('Mask did not preserve a visible foreground while removing background')
  const rows = cut.trimEnd().split('\n')
  const corners = rows
    .slice(0, 6)
    .map((row) => row.slice(0, 12) + row.slice(-12))
    .join('')
  if (ink(corners) > corners.length * 0.1)
    throw new Error('Portrait background corners were not removed')
  await window.webContents.executeJavaScript(
    `document.querySelector('button[aria-label="Comparação lado a lado"]').click();document.querySelector('.background-section').scrollIntoView({block:'nearest'})`,
  )
  await pause(1000)
  writeFileSync(
    resolve(output, 'person-cutout.png'),
    (
      await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
    ).toPNG(),
  )
  // Repeat with full printable ASCII, calibrated glyphs and enhanced detail.
  await window.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.character-presets button')).find(b=>b.textContent==='ASCII completo').click()`,
  )
  const detailed = await exportTxt('person-full-ascii.txt')
  if (ink(detailed) < 100) throw new Error('Full-ASCII foreground disappeared')
  const video = resolve(output, 'portrait-video.mp4')
  const encoded = spawnSync(
    require('ffmpeg-static'),
    [
      '-y',
      '-v',
      'error',
      '-loop',
      '1',
      '-i',
      portrait,
      '-t',
      '1',
      '-r',
      '6',
      '-vf',
      'scale=192:240',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      video,
    ],
    { windowsHide: true },
  )
  if (encoded.status !== 0) throw new Error(String(encoded.stderr))
  selectedFile = video
  await window.webContents.executeJavaScript('document.querySelector(".dropzone").click()')
  await waitFor(
    window,
    'document.querySelector(".terminal-tab").textContent.includes("portrait-video") && !document.querySelector(".loading-overlay")',
  )
  const videoCut = await exportTxt('person-video.txt')
  const frames = videoCut.split('\f')
  if (frames.length !== 6 || frames.some((frame) => ink(frame) < 100))
    throw new Error('Video segmentation lost a frame or removed the person')
  destination = resolve(output, 'person-video.mp4')
  await window.webContents.executeJavaScript('document.querySelector(".export-button").click()')
  await waitFor(window, '!!document.querySelector(".export-options")')
  await window.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.export-options button')).find(b=>b.textContent.startsWith('MP4')).click()`,
  )
  await window.webContents.executeJavaScript('document.querySelector(".modal .primary").click()')
  await waitFor(window, '!document.querySelector(".modal")')
  const probe = spawnSync(
    require('@ffprobe-installer/ffprobe').path,
    [
      '-v',
      'error',
      '-count_frames',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=nb_read_frames',
      '-of',
      'json',
      destination,
    ],
    { windowsHide: true },
  )
  if (Number(JSON.parse(probe.stdout).streams[0].nb_read_frames) !== 6)
    throw new Error('Segmented MP4 frame count mismatch')
  console.log('PASS segmented video and MP4: all 6 frames preserve the foreground')
  console.log(
    `PASS local person model, original=${ink(original)} cells, foreground=${ink(cut)} cells; full ASCII export; screenshot captured`,
  )
  app.quit()
}
main().catch((error) => {
  console.error(error)
  app.exit(1)
})
