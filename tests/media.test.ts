import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Decoder, ffmpeg, inspect } from '../electron/media'

const directory = resolve('.tmp/media-tests')
mkdirSync(directory, { recursive: true })
afterAll(() => rmSync(directory, { recursive: true, force: true }))
describe('FFmpeg integration', () => {
  for (const extension of ['mp4', 'mov', 'avi', 'mkv', 'webm', 'gif', 'png', 'jpg', 'webp']) {
    it(`detects and decodes ${extension.toUpperCase()} with bounded pull reads`, async () => {
      const file = resolve(directory, `fixture.${extension}`)
      const still = ['png', 'jpg', 'webp'].includes(extension)
      const codec =
        extension === 'webm'
          ? ['-c:v', 'libvpx-vp9', '-deadline', 'realtime']
          : ['mp4', 'mov', 'mkv'].includes(extension)
            ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p']
            : []
      const create = spawnSync(
        ffmpeg(),
        [
          '-y',
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=96x64:rate=6:duration=1',
          ...codec,
          '-threads',
          '1',
          ...(still ? ['-frames:v', '1'] : []),
          file,
        ],
        { windowsHide: true },
      )
      expect(create.status, String(create.stderr)).toBe(0)
      const media = await inspect(file)
      expect(media.width).toBe(96)
      expect(media.height).toBe(64)
      expect(media.still).toBe(still)
      const decoder = new Decoder(file, 48, 16, 0, media.fps)
      try {
        let count = 0
        for (;;) {
          const frame = await decoder.next()
          if (!frame) break
          expect(frame.pixels.length).toBe(48 * 16 * 3)
          expect(frame.index).toBe(count++)
          if (count > 100) throw new Error('Decoder failed to terminate')
        }
        expect(count).toBeGreaterThan(0)
        if (still) expect(count).toBe(1)
      } finally {
        decoder.close()
      }
    }, 30000)
  }
  it('rejects unsupported and corrupt files clearly', async () => {
    await expect(inspect(resolve(directory, 'bad.exe'))).rejects.toThrow('Formato não suportado')
    const bad = resolve(directory, 'corrupt.mp4')
    writeFileSync(bad, 'not a video')
    await expect(inspect(bad)).rejects.toThrow()
  })
})
