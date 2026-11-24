import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Deux constructions du même frontend (conception du lot 12, §3) :
//   - `centre` (et `production`, le mode par défaut de `vite build`) : l'espace des centres,
//     sans aucun écran de la console de l'éditeur ;
//   - `console` (et `development`, donc `npm run dev`) : tous les écrans.
// L'alias `@surface` désigne le module de la surface : le build centre ne lit jamais celui de la
// console, il n'a donc pas à compter sur l'élagage de Rollup. Le build par défaut est le sûr.
export default defineConfig(({ mode }) => {
  const isConsole = mode === 'console' || mode === 'development'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@surface': fileURLToPath(
          new URL(`./src/surface/${isConsole ? 'console' : 'centre'}.ts`, import.meta.url)
        ),
      },
    },
    // La console a son propre dossier : les deux constructions se suivent sans s'écraser.
    build: { outDir: mode === 'console' ? 'dist-console' : 'dist' },
  }
})
