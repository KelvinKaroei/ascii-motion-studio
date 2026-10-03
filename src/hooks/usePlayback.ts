import { useEffect, useRef, useState } from 'react'
import { AsciiPool, FrameCache } from '../engine/pool'
import type { AsciiFrame, Frame, Media, Settings } from '../types'

export function usePlayback(
  media: Media | null,
  settings: Settings,
  playing: boolean,
  speed: number,
  seek: { time: number; token: number },
  onFrame: (frame: AsciiFrame, raw: Frame) => Promise<void>,
  onEnd: () => void,
  onError: (message: string) => void,
) {
  const pool = useRef<AsciiPool | null>(null)
  const cache = useRef(new FrameCache())
  const latest = useRef({ settings, playing, speed, onFrame, onEnd, onError })
  latest.current = { settings, playing, speed, onFrame, onEnd, onError }
  const [stats, setStats] = useState({ fps: 0, ms: 0, time: 0, cache: 0, dropped: 0, queue: 0 })
  const current = useRef<Frame | null>(null)
  const revision = JSON.stringify(settings)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    pool.current = new AsciiPool()
    setReady(true)
    return () => {
      pool.current?.dispose()
      pool.current = null
    }
  }, [])
  useEffect(() => {
    cache.current.clear()
  }, [media?.id, settings.width, settings.height])
  useEffect(() => {
    if (!media || !window.studio || !pool.current || !ready) return
    const api = window.studio,
      worker = pool.current
    let cancelled = false,
      decoder: string | undefined,
      raf = 0,
      eof = false,
      busy = false
    let clock = seek.time,
      last = performance.now(),
      displayed = 0,
      dropped = 0,
      lastStats = last,
      previousSettings = ''
    let first = true
    const queue: Frame[] = []
    current.current = null
    const key = (index: number) =>
      `${media.id}:${settings.width}:${settings.height}:${Math.round(seek.time * media.fps) + index}`
    async function produce() {
      try {
        decoder = await api.decoder(media!.id, settings.width, settings.height, seek.time)
        if (cancelled) {
          await api.close(decoder)
          return
        }
        while (!cancelled) {
          if (queue.length >= 3) {
            await new Promise((resolve) => setTimeout(resolve, 12))
            continue
          }
          const raw = await api.next(decoder)
          if (!raw) {
            eof = true
            break
          }
          if (cancelled) break
          const cached = cache.current.get(key(raw.index))
          queue.push(cached ? { ...cached, index: raw.index, streamId: raw.streamId } : raw)
          if (!cached) cache.current.set(key(raw.index), raw)
        }
      } catch (error) {
        if (!cancelled) {
          eof = true
          latest.current.onError(String(error))
        }
      }
    }
    async function tick(now: number) {
      if (cancelled) return
      const state = latest.current
      if (state.playing && !first) clock += ((now - last) / 1000) * state.speed
      last = now
      const changed = previousSettings !== JSON.stringify(state.settings)
      if (!busy) {
        let raw: Frame | undefined
        const target = Math.max(0, Math.floor((clock - seek.time) * media!.fps))
        if ((state.playing || first) && queue.length && (first || queue[0].index <= target)) {
          while (queue.length > 1 && queue[1].index <= target) {
            queue.shift()
            dropped++
          }
          raw = queue.shift()
        } else if (changed && current.current) raw = current.current
        if (raw) {
          busy = true
          current.current = raw
          previousSettings = JSON.stringify(state.settings)
          try {
            const frame = await worker.convert(raw, state.settings)
            if (!cancelled) {
              await state.onFrame(frame, raw)
              displayed++
              if (first) {
                clock = seek.time
                first = false
                last = performance.now()
              }
              if (now - lastStats >= 300) {
                setStats({
                  fps: (displayed * 1000) / (now - lastStats),
                  ms: frame.ms,
                  time: Math.min(media!.duration || clock, clock),
                  cache: cache.current.bytes / 1048576,
                  dropped,
                  queue: queue.length,
                })
                displayed = 0
                lastStats = now
              }
            }
          } catch (error) {
            if (!cancelled) state.onError(String(error))
          } finally {
            busy = false
          }
        }
        if (eof && queue.length === 0 && !busy && !first) {
          state.onEnd()
          eof = false
          setStats((s) => ({ ...s, time: media!.duration, fps: media!.still ? 0 : s.fps }))
        }
      }
      if (!cancelled) raf = requestAnimationFrame(tick)
    }
    void produce()
    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (decoder) void api.close(decoder)
      queue.length = 0
    }
  }, [media?.id, settings.width, settings.height, seek.token, ready])
  // Settings are read from latest inside the animation loop, including while paused.
  void revision
  return { stats, pool }
}
