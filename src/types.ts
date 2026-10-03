export type ColorMode = 'mono' | 'truecolor' | 'ansi256' | 'blocks'
export type Style = 'studio' | 'matrix' | 'crt' | 'retro'
export type BackgroundMode = 'none' | 'person' | 'motion' | 'chroma'
export interface Settings {
  width: number
  height: number
  density: number
  chars: string
  color: ColorMode
  style: Style
  contrast: number
  sharpness: number
  autoContrast: boolean
  dither: boolean
  sortCharacters: boolean
  background: BackgroundMode
  maskThreshold: number
  feather: number
  motionSensitivity: number
  keyColor: string
  keyTolerance: number
}
export interface Media {
  id: string
  name: string
  format: string
  width: number
  height: number
  fps: number
  duration: number
  still: boolean
  size: number
}
export interface Frame {
  streamId?: string
  index: number
  pixels: Uint8Array
  width: number
  height: number
}
export interface AsciiFrame {
  ansi: string
  text: string
  html: string
  chars: string[]
  colors: Uint8Array
  width: number
  height: number
  ms: number
  png?: Uint8Array
}
export type ExportFormat = 'mp4' | 'gif' | 'html' | 'txt'
export interface DesktopAPI {
  pick(): Promise<Media | null>
  drop(file: File): Promise<Media>
  decoder(mediaId: string, width: number, height: number, start: number): Promise<string>
  next(id: string): Promise<Frame | null>
  close(id: string): Promise<void>
  exportStart(
    format: ExportFormat,
    name: string,
    fps: number,
    width: number,
    height: number,
  ): Promise<string | null>
  exportWrite(id: string, data: Uint8Array | string): Promise<void>
  exportFinish(id: string, cancel?: boolean): Promise<string>
}
declare global {
  interface Window {
    studio?: DesktopAPI
  }
}
