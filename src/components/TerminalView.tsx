import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import type { AsciiFrame, Style } from '../types'

export interface TerminalHandle {
  write: (frame: AsciiFrame) => Promise<void>
}
export const TerminalView = forwardRef<TerminalHandle, { style: Style }>(function TerminalView(
  { style },
  ref,
) {
  const host = useRef<HTMLDivElement>(null),
    terminal = useRef<Terminal | null>(null)
  const dimensions = useRef({ width: 120, height: 42 })
  const fit = useRef<() => void>(() => {})
  useEffect(() => {
    const term = new Terminal({
      cols: 120,
      rows: 42,
      fontFamily: '"Courier New", monospace',
      fontSize: 12,
      lineHeight: 1,
      letterSpacing: 0,
      scrollback: 0,
      disableStdin: true,
      cursorBlink: false,
      allowTransparency: false,
      theme: { background: '#090c10', foreground: '#b8dba4', cursor: '#090c10' },
    })
    terminal.current = term
    term.open(host.current!)
    term.write('\x1b[?25l\x1b[?7l')
    fit.current = () => {
      if (!host.current) return
      const { width, height } = dimensions.current
      term.options.fontSize = Math.max(
        3,
        Math.min(
          17,
          Math.floor(
            Math.min(
              host.current.clientWidth / (width * 0.61),
              host.current.clientHeight / (height * 1.15),
            ),
          ),
        ),
      )
      term.resize(width, height)
    }
    const observer = new ResizeObserver(() => fit.current())
    observer.observe(host.current!)
    fit.current()
    return () => {
      observer.disconnect()
      terminal.current = null
      term.dispose()
    }
  }, [])
  useImperativeHandle(
    ref,
    () => ({
      write: (frame) =>
        new Promise<void>((resolve) => {
          const term = terminal.current
          if (!term) {
            resolve()
            return
          }
          if (
            dimensions.current.width !== frame.width ||
            dimensions.current.height !== frame.height
          ) {
            dimensions.current = { width: frame.width, height: frame.height }
            fit.current()
          }
          term.write(frame.ansi, resolve)
        }),
    }),
    [],
  )
  return (
    <div className={`terminal-viewport ${style}`}>
      <div ref={host} className="terminal-host" aria-label="Prévia ASCII em tempo real" />
      {style === 'crt' && <div className="scanlines" />}
    </div>
  )
})
