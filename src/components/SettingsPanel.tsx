import type { Dispatch, SetStateAction } from 'react'
import { ArrowDownToLine, Check, ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { defaults } from '../engine/ascii'
import { characterPresets } from '../engine/characters'
import type { Settings, Style } from '../types'
const presets: { id: Style; name: string; subtitle: string; art: string; color: string }[] = [
  { id: 'studio', name: 'Studio', subtitle: 'Cor original', art: '░▒▓█', color: '#bacbf0' },
  { id: 'matrix', name: 'Matrix', subtitle: 'Digital rain', art: '01ア', color: '#8dde93' },
  { id: 'crt', name: 'CRT', subtitle: 'Fósforo verde', art: '≋≋≋', color: '#8bccb4' },
  { id: 'retro', name: 'Retro', subtitle: 'Âmbar clássico', art: '>_ ', color: '#e6b578' },
]

interface Props {
  settings: Settings
  setSettings: Dispatch<SetStateAction<Settings>>
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  hasMedia: boolean
  isStill?: boolean
  loading: boolean
  exporting: boolean
  progress: number
  onExport: () => void
}
export function SettingsPanel({
  settings,
  setSettings,
  update,
  hasMedia,
  isStill = false,
  loading,
  exporting,
  progress,
  onExport,
}: Props) {
  return (
    <aside className="settings-panel">
      <div className="panel-heading">
        <span>
          <SlidersHorizontal size={17} /> Ajustes de saída
        </span>
        <button
          className="icon-button"
          title="Restaurar ajustes"
          aria-label="Restaurar ajustes"
          onClick={() => setSettings(defaults)}
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="settings-scroll">
        <div className="settings-section">
          <div className="section-label">
            ESTILO <span>01</span>
          </div>
          <div className="preset-grid">
            {presets.map((p) => (
              <button
                key={p.id}
                className={`preset ${settings.style === p.id ? 'chosen' : ''}`}
                onClick={() => update('style', p.id)}
              >
                <span className="preset-art" style={{ color: p.color }}>
                  {p.art}
                </span>
                <span>{p.name}</span>
                {settings.style === p.id && <Check size={12} />}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-section">
          <div className="section-label">
            RESOLUÇÃO <span>02</span>
          </div>
          <div className="dimension-inputs">
            <label>
              Largura
              <div>
                <input
                  type="number"
                  min="24"
                  max="300"
                  value={settings.width}
                  onChange={(e) =>
                    update(
                      'width',
                      Math.max(24, Math.min(300, Math.round(Number(e.target.value) || 24))),
                    )
                  }
                />
                <span>col</span>
              </div>
            </label>
            <span className="dimension-cross">×</span>
            <label>
              Altura
              <div>
                <input
                  type="number"
                  min="8"
                  max="160"
                  value={settings.height}
                  onChange={(e) =>
                    update(
                      'height',
                      Math.max(8, Math.min(160, Math.round(Number(e.target.value) || 8))),
                    )
                  }
                />
                <span>lin</span>
              </div>
            </label>
          </div>
          <div className="slider-heading">
            <label htmlFor="density">Densidade</label>
            <span>{settings.density.toFixed(2)}×</span>
          </div>
          <input
            id="density"
            type="range"
            min="0.3"
            max="2.5"
            step="0.05"
            value={settings.density}
            onChange={(e) => update('density', Number(e.target.value))}
          />
          <div className="range-labels">
            <span>Leve</span>
            <span>Detalhada</span>
          </div>
        </div>
        <div className="settings-section">
          <div className="section-label">
            CARACTERES <span>03</span>
          </div>
          <label className="field-label" htmlFor="characters">
            Do escuro para o claro
          </label>
          <input
            id="characters"
            className="chars-input"
            spellCheck={false}
            maxLength={128}
            value={settings.chars}
            onChange={(e) => update('chars', e.target.value)}
          />
          <div className="character-presets">
            {characterPresets.map((p) => (
              <button
                key={p.label}
                className={settings.chars === p.chars ? 'selected' : ''}
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    chars: p.chars,
                    color: s.color === 'blocks' ? 'truecolor' : s.color,
                    sortCharacters: true,
                  }))
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="option-toggle">
            <input
              type="checkbox"
              checked={settings.sortCharacters}
              onChange={(e) => update('sortCharacters', e.target.checked)}
            />
            Ordenar por densidade dos caracteres
          </label>
          <p className="field-hint">
            ASCII completo reúne os 95 caracteres imprimíveis. Emojis e símbolos de largura dupla
            não cabem na grade.
          </p>
        </div>
        <div className="settings-section color-section">
          <div className="section-label">
            MODO DE COR <span>04</span>
          </div>
          <div className="select-wrap">
            <span className={`color-swatch ${settings.color}`} />
            <select
              aria-label="Modo de cor"
              value={settings.color}
              onChange={(e) => update('color', e.target.value as Settings['color'])}
            >
              <option value="truecolor">True Color · 24 bits</option>
              <option value="ansi256">ANSI · 256 cores</option>
              <option value="mono">Preto e branco</option>
              <option value="blocks">Unicode Blocks</option>
            </select>
            <ChevronDown size={14} />
          </div>
          <p className="field-hint">
            {settings.style !== 'studio'
              ? 'O preset aplica sua própria paleta de cor.'
              : settings.color === 'blocks'
                ? 'Luminância em blocos ░ ▒ ▓ █.'
                : 'Cor e detalhe, caractere por caractere.'}
          </p>
        </div>
        <div className="settings-section">
          <div className="section-label">
            DETALHES <span>05</span>
          </div>
          <div className="character-presets">
            <button
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  chars: characterPresets[1].chars,
                  sortCharacters: true,
                  contrast: 1.15,
                  sharpness: 0.6,
                  autoContrast: true,
                  dither: true,
                  color: 'truecolor',
                  style: 'studio',
                }))
              }
            >
              Retrato detalhado
            </button>
            <button
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  contrast: 1,
                  sharpness: 0,
                  autoContrast: false,
                  dither: false,
                }))
              }
            >
              Suave
            </button>
          </div>
          <div className="slider-heading">
            <label htmlFor="contrast">Contraste</label>
            <span>{settings.contrast.toFixed(2)}×</span>
          </div>
          <input
            id="contrast"
            type="range"
            min="0.5"
            max="2.5"
            step="0.05"
            value={settings.contrast}
            onChange={(e) => update('contrast', Number(e.target.value))}
          />
          <div className="slider-heading">
            <label htmlFor="sharpness">Nitidez dos contornos</label>
            <span>{settings.sharpness.toFixed(2)}</span>
          </div>
          <input
            id="sharpness"
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={settings.sharpness}
            onChange={(e) => update('sharpness', Number(e.target.value))}
          />
          <label className="option-toggle">
            <input
              type="checkbox"
              checked={settings.autoContrast}
              onChange={(e) => update('autoContrast', e.target.checked)}
            />
            Contraste automático
          </label>
          <label className="option-toggle">
            <input
              type="checkbox"
              checked={settings.dither}
              onChange={(e) => update('dither', e.target.checked)}
            />
            Dithering · mais tons e textura
          </label>
          <p className="field-hint">
            Para mais detalhe espacial, aumente a largura e a altura da grade. Contraste automático
            por frame pode oscilar em vídeos.
          </p>
        </div>
        <div className="settings-section background-section">
          <div className="section-label">
            REMOVER FUNDO <span>06</span>
          </div>
          <div className="select-wrap">
            <select
              aria-label="Remover fundo"
              value={settings.background}
              onChange={(e) => update('background', e.target.value as Settings['background'])}
            >
              <option value="none">Manter fundo original</option>
              <option value="person">Remover fundo · manter pessoas</option>
              <option value="motion" disabled={isStill}>
                Somente movimento · vídeo
              </option>
              <option value="chroma">Remover uma cor · chroma key</option>
            </select>
            <ChevronDown size={14} />
          </div>
          <p className="field-hint">
            {settings.background === 'person'
              ? 'Preserva as pessoas, inclusive paradas, e apaga o cenário. Recorte local; cabelos e objetos nas mãos podem exigir ajuste.'
              : settings.background === 'motion'
                ? 'Use câmera fixa. O primeiro frame é referência; partes paradas desaparecem. Movimento da câmera também será detectado.'
                : settings.background === 'chroma'
                  ? 'Escolha a cor do cenário a ser apagada. Cores iguais na pessoa também podem desaparecer.'
                  : 'O fundo removido vira espaço vazio sobre o terminal escuro e também nas exportações.'}
          </p>
          {settings.background === 'person' && (
            <>
              <div className="slider-heading">
                <label htmlFor="maskThreshold">Precisão do recorte</label>
                <span>{Math.round(settings.maskThreshold * 100)}%</span>
              </div>
              <input
                id="maskThreshold"
                type="range"
                min="0.1"
                max="0.9"
                step="0.02"
                value={settings.maskThreshold}
                onChange={(e) => update('maskThreshold', Number(e.target.value))}
              />
            </>
          )}
          {settings.background === 'motion' && (
            <>
              <div className="slider-heading">
                <label htmlFor="motionSensitivity">Sensibilidade ao movimento</label>
                <span>{Math.round(settings.motionSensitivity * 100)}%</span>
              </div>
              <input
                id="motionSensitivity"
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={settings.motionSensitivity}
                onChange={(e) => update('motionSensitivity', Number(e.target.value))}
              />
            </>
          )}
          {settings.background === 'chroma' && (
            <>
              <label className="key-color">
                Cor do fundo
                <input
                  type="color"
                  aria-label="Cor do fundo"
                  value={settings.keyColor}
                  onChange={(e) => update('keyColor', e.target.value)}
                />
              </label>
              <div className="slider-heading">
                <label htmlFor="keyTolerance">Tolerância de cor</label>
                <span>{Math.round(settings.keyTolerance * 100)}%</span>
              </div>
              <input
                id="keyTolerance"
                type="range"
                min="0.01"
                max="0.9"
                step="0.01"
                value={settings.keyTolerance}
                onChange={(e) => update('keyTolerance', Number(e.target.value))}
              />
            </>
          )}
          {settings.background !== 'none' && (
            <>
              <div className="slider-heading">
                <label htmlFor="feather">Suavizar bordas</label>
                <span>{Math.round(settings.feather * 100)}%</span>
              </div>
              <input
                id="feather"
                type="range"
                min="0"
                max="0.5"
                step="0.01"
                value={settings.feather}
                onChange={(e) => update('feather', Number(e.target.value))}
              />
            </>
          )}
        </div>
      </div>
      <div className="export-section">
        <div className="live-note">
          <span /> Ajustes aplicados em tempo real
        </div>
        <button
          className="button primary export-button"
          disabled={!hasMedia || loading || exporting}
          onClick={() => onExport()}
        >
          <ArrowDownToLine size={16} />
          {exporting ? `Exportando ${Math.round(progress * 100)}%` : 'Exportar criação'}
          <span>↗</span>
        </button>
        <div className="export-formats">
          MP4 <span>·</span> GIF <span>·</span> HTML <span>·</span> TXT
        </div>
      </div>
    </aside>
  )
}
