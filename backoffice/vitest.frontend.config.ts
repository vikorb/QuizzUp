import path from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const rootDir = process.cwd()

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'frontend/src'),
      '@shared': path.resolve(rootDir, 'shared/src'),
      '@quizzup/shared': path.resolve(rootDir, 'shared/src/index.ts'),
      '@frontend-tests': path.resolve(rootDir, 'tests/frontend/src'),

      'vue-i18n': path.resolve(rootDir, 'tests/frontend/src/_helpers/i18nMock.ts'),
      
      vue: path.resolve(rootDir, 'node_modules/vue'),
      'vue-router': path.resolve(rootDir, 'node_modules/vue-router'),
      '@vue/runtime-core': path.resolve(rootDir, 'node_modules/@vue/runtime-core'),
      '@vue/runtime-dom': path.resolve(rootDir, 'node_modules/@vue/runtime-dom'),
      '@vue/reactivity': path.resolve(rootDir, 'node_modules/@vue/reactivity'),
      '@vue/shared': path.resolve(rootDir, 'node_modules/@vue/shared'),
    },
    dedupe: [
      'vue',
      'vue-router',
      '@vue/runtime-core',
      '@vue/runtime-dom',
      '@vue/reactivity',
      '@vue/shared',
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/frontend/src/_helpers/registerFrontendMocks.ts'],
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
