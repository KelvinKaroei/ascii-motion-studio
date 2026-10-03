import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve('electron/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve('electron/preload.ts') } },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      minify: 'esbuild',
      cssMinify: true,
      sourcemap: true,
      rollupOptions: { input: resolve('index.html') },
    },
  },
})
