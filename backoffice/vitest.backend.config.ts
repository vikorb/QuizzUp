import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@backend': path.resolve(process.cwd(), 'backend/src'),
      '@quizzup/shared': fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['tests/backend/setup/env.ts'],
    include: ['tests/backend/**/*.test.ts'],
    exclude: [
      'node_modules',
      'backend/node_modules',
      'frontend/node_modules',
      'shared/node_modules',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage/backend',
    },
  },
})
