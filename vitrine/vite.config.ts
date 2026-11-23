import path from 'node:path'

import { defineConfig } from 'vite'

import { PAGES } from './build/pages'
import { vitrinePlugins } from './build/plugins'

const root = import.meta.dirname

export default defineConfig({
  plugins: vitrinePlugins(),
  server: { port: 4176 },
  preview: { port: 4176 },
  build: {
    // Pas d'image ni de police en base64 dans les feuilles : la CSP interdit `data:`.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((page) => [page.file, path.resolve(root, page.file)])),
    },
  },
})
