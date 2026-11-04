import { defineConfig, devices } from '@playwright/test'

/**
 * Tests de bout en bout : l'écran de salle (`game/room-app`, port 4174) en mode démo et
 * le banc d'essai (`harness/`, port 4175) qui assemble moteur, audio et matériel.
 * Les deux serveurs Vite sont démarrés par Playwright.
 */
const ROOM_APP_URL = 'http://localhost:4174'
const HARNESS_URL = 'http://localhost:4175'
const isCi = Boolean(process.env.CI)

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: isCi ? 2 : undefined,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'room-app',
      testMatch: /room-app\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ROOM_APP_URL,
        viewport: { width: 1600, height: 900 },
      },
    },
    {
      name: 'harness',
      testMatch: /harness\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: HARNESS_URL },
    },
  ],
  webServer: [
    {
      command: 'npm --prefix ../room-app run dev -- --port 4174 --strictPort',
      url: ROOM_APP_URL,
      reuseExistingServer: !isCi,
      timeout: 120_000,
      // L'API du backoffice n'est pas démarrée : les tests de connexion la simulent.
      env: { VITE_API_URL: 'http://api.quizzup.test' },
    },
    {
      command: 'npm run harness',
      url: `${HARNESS_URL}/audio.html`,
      reuseExistingServer: !isCi,
      timeout: 120_000,
    },
  ],
})
