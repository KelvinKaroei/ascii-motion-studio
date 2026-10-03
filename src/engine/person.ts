import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import { softThreshold } from './masks'
import type { Frame, Settings } from '../types'

/** A lazy CPU/WASM model per worker. Foreground confidence represents the person. */
export class PersonMask {
  private model?: Promise<ImageSegmenter>
  private frameKey = ''
  private confidence?: Float32Array
  async mask(frame: Frame, settings: Settings, assets: string) {
    const key = `${frame.streamId}:${frame.index}:${frame.width}:${frame.height}`
    if (key !== this.frameKey || !this.confidence) {
      if (!this.model) {
        this.model = (async () => {
          const files = await FilesetResolver.forVisionTasks(assets, true)
          return ImageSegmenter.createFromOptions(files, {
            baseOptions: { modelAssetPath: `${assets}/selfie_segmenter.tflite`, delegate: 'CPU' },
            runningMode: 'IMAGE',
            outputConfidenceMasks: true,
            outputCategoryMask: false,
            canvas: new OffscreenCanvas(256, 256),
          })
        })().catch((error) => {
          this.model = undefined
          throw new Error(`Não foi possível carregar o recorte local de pessoas. ${String(error)}`)
        })
      }
      const model = await this.model
      const rgba = new Uint8ClampedArray(frame.width * frame.height * 4)
      for (let i = 0; i < frame.width * frame.height; i++) {
        rgba[i * 4] = frame.pixels[i * 3]
        rgba[i * 4 + 1] = frame.pixels[i * 3 + 1]
        rgba[i * 4 + 2] = frame.pixels[i * 3 + 2]
        rgba[i * 4 + 3] = 255
      }
      model.segment(new ImageData(rgba, frame.width, frame.height), (result) => {
        const mask = result.confidenceMasks?.[0]
        if (!mask) throw new Error('O modelo não retornou uma máscara de pessoa.')
        const input = mask.getAsFloat32Array()
        const output = new Float32Array(frame.width * frame.height)
        for (let y = 0; y < frame.height; y++)
          for (let x = 0; x < frame.width; x++) {
            output[y * frame.width + x] =
              input[
                Math.min(mask.height - 1, Math.floor((y * mask.height) / frame.height)) *
                  mask.width +
                  Math.min(mask.width - 1, Math.floor((x * mask.width) / frame.width))
              ]
          }
        this.confidence = output
      })
      this.frameKey = key
    }
    return this.confidence!.map((value) =>
      softThreshold(value, settings.maskThreshold, settings.feather),
    )
  }
}
