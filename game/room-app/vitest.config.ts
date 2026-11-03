import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

import { ROOM_APP_ALIASES } from './vite.config'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: ROOM_APP_ALIASES },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/main.ts', 'src/env.d.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
})
