// Copy the exact installed MediaPipe runtime; download its local person model once.
const { mkdir, copyFile, access, writeFile, rename, rm } = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { createHash } = require('node:crypto')
const root = resolve(__dirname, '..')
const target = join(root, 'public', 'vision')
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const url =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite'
async function main() {
  await mkdir(target, { recursive: true })
  for (const file of ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm'])
    await copyFile(join(source, file), join(target, file))
  const model = join(target, 'selfie_segmenter.tflite')
  try {
    await access(model)
    return
  } catch {}
  console.log('Baixando modelo local de recorte de pessoas (MediaPipe)...')
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`Download do modelo falhou: ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.subarray(4, 8).toString() !== 'TFL3')
    throw new Error('Modelo inválido: não é um arquivo TensorFlow Lite.')
  const partial = model + '.partial'
  try {
    await writeFile(partial, bytes)
    await rename(partial, model)
  } finally {
    await rm(partial, { force: true })
  }
  await writeFile(
    join(target, 'model-source.json'),
    JSON.stringify(
      {
        source: url,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        provider: 'Google MediaPipe',
        model: 'Selfie Segmenter float16 v1',
      },
      null,
      2,
    ),
  )
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
