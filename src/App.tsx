import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  CircleHelp,
  Code2,
  Columns2,
  FileVideo2,
  FolderOpen,
  Image,
  Layers3,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  TerminalSquare,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { defaults } from './engine/ascii'
import { demoFrame } from './engine/demo'
import { exportMedia } from './engine/export'
import { restoreSettings } from './engine/settings'
import { usePlayback } from './hooks/usePlayback'
import { TerminalView, type TerminalHandle } from './components/TerminalView'
import { SettingsPanel } from './components/SettingsPanel'
import type { AsciiFrame, ExportFormat, Frame, Media, Settings } from './types'

const timeLabel = (time: number) =>
  `${Math.floor(time / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(time % 60)
    .toString()
    .padStart(2, '0')}`
export default function App() {
  const [media, setMedia] = useState<Media | null>(null)
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return restoreSettings(localStorage.getItem('ascii-settings'))
    } catch {
      return defaults
    }
  })
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [comparison, setComparison] = useState(false)
  const [seek, setSeek] = useState({ time: 0, token: 0 }),
    [loading, setLoading] = useState(false),
    [drag, setDrag] = useState(false)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [help, setHelp] = useState(false)
  const [exportOpen, setExportOpen] = useState(false),
    [format, setFormat] = useState<ExportFormat>('mp4'),
    [exporting, setExporting] = useState(false),
    [progress, setProgress] = useState(0)
  const [ended, setEnded] = useState(false)
  const [fpsHistory, setFpsHistory] = useState<number[]>(Array(9).fill(0))
  const terminal = useRef<TerminalHandle>(null),
    original = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null)
  const sourceAspect = useRef(16 / 9)
  const sampleCanvas = useRef<OffscreenCanvas | null>(null)
  const abort = useRef<AbortController | null>(null),
    importToken = useRef(0),
    rawRef = useRef<Frame | null>(null)
  const drawOriginal = (raw: Frame) => {
    const canvas = original.current
    if (!canvas) return
    // Restore square-pixel aspect: the ASCII sample deliberately uses shorter rows.
    if (!sampleCanvas.current) sampleCanvas.current = new OffscreenCanvas(raw.width, raw.height)
    const sample = sampleCanvas.current
    if (sample.width !== raw.width) sample.width = raw.width
    if (sample.height !== raw.height) sample.height = raw.height
    const ctx = sample.getContext('2d')!,
      data = ctx.createImageData(raw.width, raw.height)
    for (let i = 0; i < raw.width * raw.height; i++) {
      data.data[i * 4] = raw.pixels[i * 3]
      data.data[i * 4 + 1] = raw.pixels[i * 3 + 1]
      data.data[i * 4 + 2] = raw.pixels[i * 3 + 2]
      data.data[i * 4 + 3] = 255
    }
    ctx.putImageData(data, 0, 0)
    const width = Math.max(1, Math.round(Math.min(320, 320 * sourceAspect.current)))
    const height = Math.max(1, Math.round(width / sourceAspect.current))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    canvas.getContext('2d')!.drawImage(sample, 0, 0, width, height)
  }
  const onFrame = useCallback(async (frame: AsciiFrame, raw: Frame) => {
    rawRef.current = raw
    drawOriginal(raw)
    setLoading(false)
    await terminal.current?.write(frame)
  }, [])
  const { stats, pool } = usePlayback(
    media,
    settings,
    playing,
    speed,
    seek,
    onFrame,
    () => {
      setPlaying(false)
      setEnded(true)
    },
    (message) => {
      setError(message)
      setLoading(false)
      setPlaying(false)
    },
  )
  useEffect(() => {
    try {
      localStorage.setItem('ascii-settings', JSON.stringify(settings))
    } catch {
      /* Preferences are optional when storage is unavailable. */
    }
  }, [settings])
  useEffect(() => {
    setFpsHistory((history) => [...history.slice(1), stats.fps])
  }, [stats.fps])
  useEffect(() => {
    if (comparison && rawRef.current) drawOriginal(rawRef.current)
  }, [comparison])
  useEffect(() => {
    if (media) return
    let phase = 0
    const timer = setInterval(() => {
      void terminal.current?.write(demoFrame((phase += 0.16), settings))
    }, 120)
    return () => clearInterval(timer)
  }, [media, settings])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 6000)
    return () => clearTimeout(timer)
  }, [notice])
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if ((key === 'width' || key === 'height') && media) {
      setSeek((s) => ({
        time: Math.min(stats.time, Math.max(0, media.duration - 1 / media.fps)),
        token: s.token + 1,
      }))
      setEnded(false)
    }
    setSettings((s) => ({ ...s, [key]: value }))
  }
  const restart = (time = 0) => {
    setEnded(false)
    setSeek((s) => ({ time, token: s.token + 1 }))
    setPlaying(true)
  }
  const toggle = () => {
    if (!media || media.still) return
    if (ended) restart()
    else setPlaying((p) => !p)
  }
  async function importFile(file?: File) {
    if (exporting) {
      setNotice('Aguarde ou cancele a exportação antes de trocar de arquivo.')
      return
    }
    if (!window.studio) {
      setError('Abra o aplicativo desktop com npm run dev para importar arquivos.')
      return
    }
    const token = ++importToken.current
    setError('')
    setLoading(true)
    try {
      const next = file ? await window.studio.drop(file) : await window.studio.pick()
      if (token !== importToken.current) return
      if (!next) {
        setLoading(false)
        return
      }
      setSettings((s) => ({
        ...s,
        background: next.still && s.background === 'motion' ? 'none' : s.background,
        height: Math.max(
          8,
          Math.min(160, Math.round(((s.width * next.height) / next.width) * 0.5)),
        ),
      }))
      sourceAspect.current = next.width / next.height
      setMedia(next)
      setEnded(false)
      setPlaying(true)
      setSeek((s) => ({ time: 0, token: s.token + 1 }))
    } catch (err) {
      if (token === importToken.current) {
        setError(String(err))
        setLoading(false)
      }
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) return
      if (event.code === 'Space') {
        event.preventDefault()
        toggle()
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'o') {
        event.preventDefault()
        void importFile()
      }
      if (event.key === 'Escape') {
        setHelp(false)
        if (!exporting) setExportOpen(false)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  async function runExport() {
    if (!media || !window.studio || !pool.current) return
    abort.current = new AbortController()
    setExporting(true)
    setProgress(0)
    setError('')
    try {
      const path = await exportMedia(
        window.studio,
        pool.current,
        media,
        { ...settings },
        format,
        speed,
        abort.current.signal,
        setProgress,
      )
      if (path) {
        setNotice(`Exportação salva: ${path}`)
        setExportOpen(false)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setExporting(false)
      abort.current = null
    }
  }
  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        const file = e.dataTransfer.files[0]
        if (file) void importFile(file)
      }}
    >
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <TerminalSquare size={22} />
          </div>
          <span>
            <strong className="brand-watermark">Frag!</strong> ASCII <b>Motion Studio</b>
            <small>DESKTOP WORKSPACE</small>
          </span>
          <span className="version">v1.0</span>
        </div>
        <div className="top-actions">
          <span className="local-badge">
            <span /> 100% local
          </span>
          <button
            className="icon-button"
            title="Ajuda e atalhos"
            aria-label="Ajuda e atalhos"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={18} />
          </button>
          <div className="avatar">AM</div>
        </div>
      </header>
      <div className="workspace">
        <nav className="rail" aria-label="Ferramentas">
          <button
            className="rail-button active"
            title="Estúdio"
            aria-label="Estúdio"
            onClick={() => stage.current?.focus()}
          >
            <TerminalSquare />
          </button>
          <button
            className="rail-button"
            title="Importar mídia"
            aria-label="Importar mídia"
            onClick={() => void importFile()}
          >
            <FolderOpen />
          </button>
          <button
            className={`rail-button ${comparison ? 'selected' : ''}`}
            title="Comparar original"
            aria-label="Comparar original"
            onClick={() => setComparison((v) => !v)}
          >
            <Columns2 />
          </button>
          <div className="rail-bottom">
            <button
              className="rail-button"
              title="Restaurar configurações"
              aria-label="Restaurar configurações"
              onClick={() => setSettings(defaults)}
            >
              <Settings2 />
            </button>
            <span className="rail-line" />
            <span className="engine-dot" />
          </div>
        </nav>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PIXELS IN. CHARACTERS OUT.</div>
              <h1>
                Movimento em outra linguagem<span>.</span>
              </h1>
              <p>
                Transforme imagens e vídeos em arte ASCII. Solte um arquivo e dê vida aos
                caracteres.
              </p>
            </div>
            <button
              className="button secondary"
              onClick={() => void importFile()}
              disabled={exporting}
            >
              <Plus size={16} /> Nova mídia
            </button>
          </div>
          <div className="studio-grid">
            <section className="preview-column">
              <div className="preview-card" ref={stage} tabIndex={-1}>
                <div className="terminal-toolbar">
                  <div className="terminal-tab">
                    <TerminalSquare size={15} />
                    <span>{media ? media.name : 'orbital-study.ascii'}</span>
                    <span className="tab-dot" />
                  </div>
                  <div className="preview-tools">
                    <span className="live">
                      <span />
                      {media ? (playing ? 'LIVE' : 'PAUSADO') : 'DEMO'}
                    </span>
                    <button
                      className={`icon-button ${comparison ? 'selected' : ''}`}
                      title="Comparação lado a lado"
                      aria-label="Comparação lado a lado"
                      onClick={() => setComparison((v) => !v)}
                    >
                      <Columns2 size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Tela cheia"
                      aria-label="Tela cheia"
                      onClick={() => {
                        if (document.fullscreenElement) void document.exitFullscreen()
                        else void stage.current?.requestFullscreen()
                      }}
                    >
                      <Maximize2 size={15} />
                    </button>
                  </div>
                </div>
                <div className={`preview-stage ${comparison ? 'split' : ''}`}>
                  {comparison && (
                    <div className="original-panel">
                      <span className="pane-label">ORIGINAL · AMOSTRA FFMPEG</span>
                      <canvas
                        ref={original}
                        style={{
                          aspectRatio: media ? `${media.width} / ${media.height}` : '16 / 9',
                        }}
                      />
                      {!media && (
                        <span className="original-placeholder">
                          Importe uma mídia para comparar
                        </span>
                      )}
                    </div>
                  )}
                  <div className="ascii-panel">
                    <span className="pane-label">
                      {comparison ? 'ASCII OUTPUT' : 'ASCII / PREVIEW'}
                    </span>
                    <TerminalView ref={terminal} style={settings.style} />
                    {!media && (
                      <div className="demo-caption">
                        <span>ESTUDO Nº 001</span>
                        <b>Um universo de caracteres.</b>
                        <span>PRÉVIA PROCEDURAL · {settings.width} COLUNAS</span>
                      </div>
                    )}
                  </div>
                  {loading && (
                    <div className="loading-overlay">
                      <LoaderCircle className="spin" />
                      <span>Lendo frames, criando movimento…</span>
                    </div>
                  )}
                </div>
                <div className="playback">
                  <div className="timeline">
                    <input
                      aria-label="Posição do vídeo"
                      type="range"
                      min="0"
                      max={media?.duration || 1}
                      step="0.05"
                      value={Math.min(stats.time, media?.duration || 1)}
                      disabled={!media || media.still || loading}
                      onChange={(e) => restart(Number(e.target.value))}
                    />
                  </div>
                  <div className="playback-row">
                    <div className="transport">
                      <button
                        className="play-button"
                        title={playing ? 'Pausar (espaço)' : 'Reproduzir (espaço)'}
                        aria-label={playing ? 'Pausar' : 'Reproduzir'}
                        disabled={!media || media.still}
                        onClick={toggle}
                      >
                        {playing ? (
                          <Pause size={17} fill="currentColor" />
                        ) : (
                          <Play size={17} fill="currentColor" />
                        )}
                      </button>
                      <button
                        className="icon-button"
                        title="Reiniciar"
                        aria-label="Reiniciar"
                        disabled={!media}
                        onClick={() => restart()}
                      >
                        <RotateCcw size={16} />
                      </button>
                      <span className="timecode">
                        {timeLabel(stats.time)}
                        <span> / {timeLabel(media?.duration || 0)}</span>
                      </span>
                    </div>
                    <div className="transport">
                      <select
                        className="speed-select"
                        aria-label="Velocidade"
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                      >
                        {[0.25, 0.5, 1, 1.5, 2].map((n) => (
                          <option key={n} value={n}>
                            {n}×
                          </option>
                        ))}
                      </select>
                      <span className="separator" />
                      <span className="resolution">
                        {settings.width} × {settings.height}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <button
                className={`dropzone ${drag ? 'dragging' : ''}`}
                onClick={() => void importFile()}
                disabled={exporting}
              >
                <span className="upload-icon">
                  <Upload size={23} />
                </span>
                <span className="drop-copy">
                  <strong>
                    {media
                      ? 'Solte outra mídia para continuar criando'
                      : 'Arraste sua mídia. Assista à transformação.'}
                  </strong>
                  <span>
                    ou <em>escolha um arquivo</em> do seu computador
                  </span>
                  <small>MP4, MOV, AVI, MKV, WEBM, GIF, PNG, JPG, WEBP</small>
                </span>
                <span className="drop-arrow">
                  <ArrowRight size={19} />
                </span>
              </button>
              <div className="metrics">
                <div>
                  <span className="metric-icon">
                    <AudioLines size={17} />
                  </span>
                  <span>
                    <small>REPRODUÇÃO</small>
                    <strong>
                      {media ? stats.fps.toFixed(1) : '—'} <em>FPS</em>
                    </strong>
                  </span>
                  <span className="sparkline" aria-hidden="true">
                    {fpsHistory
                      .map(
                        (fps) =>
                          '▁▂▃▄▅▆▇█'[
                            Math.min(
                              7,
                              Math.round((fps / Math.max(1, (media?.fps || 30) * speed)) * 7),
                            )
                          ],
                      )
                      .join('')}
                  </span>
                </div>
                <div>
                  <span className="metric-icon">
                    <Zap size={17} />
                  </span>
                  <span>
                    <small>CONVERSÃO / FRAME</small>
                    <strong>
                      {media ? stats.ms.toFixed(1) : '—'} <em>ms</em>
                    </strong>
                  </span>
                </div>
                <div>
                  <span className="metric-icon">
                    <Layers3 size={17} />
                  </span>
                  <span>
                    <small>CACHE DE FRAMES</small>
                    <strong>
                      {stats.cache.toFixed(1)} <em>MB</em>
                    </strong>
                  </span>
                  <span className="metric-tag">12 MB máx.</span>
                </div>
              </div>
              <div className="workflow-note">
                <Zap size={13} />
                <span>Sem botão de converter. Sem upload. Só você e sua próxima criação.</span>
                <span className="queue-info">
                  Fila {stats.queue}/3 · {stats.dropped} descartados
                </span>
              </div>
            </section>
            <SettingsPanel
              settings={settings}
              setSettings={setSettings}
              update={update}
              hasMedia={!!media}
              isStill={media?.still}
              loading={loading}
              exporting={exporting}
              progress={progress}
              onExport={() => setExportOpen(true)}
            />
          </div>
        </main>
      </div>
      <footer className="statusbar">
        <div>
          <span className={`status-dot ${window.studio ? '' : 'preview'}`} />
          {window.studio ? 'Engine pronta' : 'Prévia web · importe no app desktop'}
          <span className="footer-divider" /> FFmpeg + Web Workers
        </div>
        <div>
          {media
            ? `${media.format} · ${media.width} × ${media.height} · ${media.fps.toFixed(2)} FPS`
            : 'Seu próximo frame começa aqui.'}
          <span className="footer-divider" />
          <Code2 size={12} /> UTF-8
        </div>
      </footer>
      {drag && (
        <div className="drop-overlay">
          <Upload size={42} />
          <h2>Solte e veja acontecer.</h2>
          <p>O processamento começa automaticamente.</p>
        </div>
      )}
      {(error || notice) && (
        <div role={error ? 'alert' : 'status'} className={`toast ${error ? 'error' : ''}`}>
          <span>{error || notice}</span>
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => {
              setError('')
              setNotice('')
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Sobre o estúdio"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Fechar ajuda"
              onClick={() => setHelp(false)}
            >
              <X />
            </button>
            <Sparkles className="modal-symbol" />
            <h2>Uma nova forma de ver.</h2>
            <p>
              Arraste uma imagem, GIF ou vídeo. A reprodução ASCII começa assim que o primeiro frame
              está pronto.
            </p>
            <div className="help-row">
              <span>Importar arquivo</span>
              <kbd>Ctrl / ⌘ + O</kbd>
            </div>
            <div className="help-row">
              <span>Reproduzir / pausar</span>
              <kbd>Espaço</kbd>
            </div>
            <p className="field-hint">
              Processamento local. Vídeos com FPS variável são normalizados pelo FFmpeg. Comparação
              usa uma amostra RGB sincronizada. Exportações não incluem áudio. Caracteres ASCII e
              blocos de largura simples são aceitos.
            </p>
            <button className="button primary" onClick={() => setHelp(false)}>
              Vamos criar <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
      {exportOpen && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Exportar criação">
            <button
              className="modal-close icon-button"
              aria-label="Fechar exportação"
              disabled={exporting}
              onClick={() => setExportOpen(false)}
            >
              <X />
            </button>
            <ArrowDownToLine className="modal-symbol" />
            <h2>Leve os caracteres com você.</h2>
            <p>A mídia completa, com os ajustes atuais e velocidade {speed}×.</p>
            <div className="export-options">
              {(['mp4', 'gif', 'html', 'txt'] as ExportFormat[]).map((f) => (
                <button
                  disabled={exporting}
                  className={format === f ? 'chosen' : ''}
                  key={f}
                  onClick={() => setFormat(f)}
                >
                  {f === 'mp4' ? (
                    <FileVideo2 />
                  ) : f === 'gif' ? (
                    <Image />
                  ) : f === 'html' ? (
                    <Code2 />
                  ) : (
                    <TerminalSquare />
                  )}
                  <b>{f.toUpperCase()}</b>
                  <small>
                    {
                      {
                        mp4: 'Vídeo H.264',
                        gif: 'Loop animado',
                        html: 'Player responsivo',
                        txt: 'Frames em texto',
                      }[f]
                    }
                  </small>
                </button>
              ))}
            </div>
            <p className="field-hint">
              {format === 'html'
                ? 'HTML independente com cores e controles. Animações longas podem gerar arquivos grandes no navegador.'
                : format === 'txt'
                  ? 'Frames separados por form feed (\f). Texto puro, sem cores.'
                  : 'Renderização quadro a quadro, sem áudio. A exportação mantém todos os frames.'}
            </p>
            {exporting && (
              <>
                <progress max="1" value={progress} />
                <p className="export-progress">
                  {Math.round(progress * 100)}% · Processando com memória limitada
                </p>
              </>
            )}
            <button
              className="button primary"
              disabled={exporting}
              onClick={() => void runExport()}
            >
              {exporting ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ArrowDownToLine size={16} />
              )}{' '}
              {exporting ? 'Exportando…' : 'Escolher destino e exportar'}
            </button>
            {exporting && (
              <button
                className="button secondary cancel-button"
                onClick={() => abort.current?.abort()}
              >
                Cancelar exportação
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
