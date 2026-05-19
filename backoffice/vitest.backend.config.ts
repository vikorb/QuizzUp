import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@backend': path.resolve(process.cwd(), 'backend/src'),
      '@shared': path.resolve(process.cwd(), 'shared/src'),
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
