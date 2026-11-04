import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/**
 * Le moteur (`game/engine`), le matériel (`game/hardware`), l'audio (`game/audio`), les constantes partagées (`backoffice/shared`) et la
 * charte graphique du backoffice (`backoffice/frontend/src/assets`) sont consommés
 * en sources, sans build, via des alias.
 */
export const ROOM_APP_ALIASES = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  '@quizzup/game-engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
  '@quizzup/hardware': fileURLToPath(new URL('../hardware/src/index.ts', import.meta.url)),
  '@quizzup/audio': fileURLToPath(new URL('../audio/src/index.ts', import.meta.url)),
  '@quizzup/shared': fileURLToPath(
    new URL('../../backoffice/shared/src/index.ts', import.meta.url)
  ),
  '@backoffice-assets': fileURLToPath(
    new URL('../../backoffice/frontend/src/assets', import.meta.url)
  ),
}

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: ROOM_APP_ALIASES },
  server: {
    port: 4174,
    fs: { allow: ['..', '../../backoffice/shared', '../../backoffice/frontend/src/assets'] },
  },
})
