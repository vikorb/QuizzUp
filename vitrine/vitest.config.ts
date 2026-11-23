import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@quizzup/shared': fileURLToPath(
        new URL('../backoffice/shared/src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Les tests de construction lancent un vrai `vite build`.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
