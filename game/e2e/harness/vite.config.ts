import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

/**
 * Banc d'essai des tests de bout en bout : de petites pages qui assemblent les vrais
 * paquets (moteur, audio, matériel, pont audio de l'écran de salle) dans Chromium,
 * là où l'écran de salle ne les branche pas encore. Tout est consommé en sources.
 */
const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export const HARNESS_PORT = 4175

export default defineConfig({
  root: fromHere('.'),
  resolve: {
    alias: {
      '@quizzup/game-engine': fromHere('../../engine/src/index.ts'),
      '@quizzup/audio': fromHere('../../audio/src/index.ts'),
      '@quizzup/hardware': fromHere('../../hardware/src/index.ts'),
      '@quizzup/shared': fromHere('../../../backoffice/shared/src/index.ts'),
      '@room-app': fromHere('../../room-app/src'),
      // Imports internes du pont audio de l'écran de salle (`@/audio/player`).
      '@': fromHere('../../room-app/src'),
    },
  },
  server: {
    port: HARNESS_PORT,
    strictPort: true,
    fs: { allow: [fromHere('../..'), fromHere('../../../backoffice/shared')] },
  },
})
