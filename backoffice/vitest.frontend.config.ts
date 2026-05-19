import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'frontend/src'),
      '@shared': path.resolve(process.cwd(), 'shared/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/frontend/**/*.test.ts'],
    exclude: [
      'node_modules',
      'backend/node_modules',
      'frontend/node_modules',
      'shared/node_modules',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage/frontend',
    },
  },
})
