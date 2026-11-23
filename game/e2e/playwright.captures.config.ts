import { defineConfig, devices } from '@playwright/test'

import { API_URL, ROOM_APP_URL } from './tests/support/urls'

/**
 * Captures de l'écran de salle pour le site vitrine (`npm run captures`), hors de la suite de
 * tests : la salle en mode démo tourne en 1920 × 1080 et `captures/vitrine.spec.ts` enregistre
 * les images dans `vitrine/public/captures`.
 */
export default defineConfig({
  testDir: './captures',
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: ROOM_APP_URL,
    locale: 'fr-FR',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'npm --prefix ../room-app run dev -- --port 4174 --strictPort',
    url: ROOM_APP_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_API_URL: API_URL },
  },
})
