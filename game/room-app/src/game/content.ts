import type { EngineTheme } from '@quizzup/game-engine'
import { QUESTION_MEDIA_TYPE_AUDIO } from '@quizzup/shared'

import { getDemoThemes } from '@/game/demoContent'

/** Contenu du mode démo (sans backoffice) : thèmes « sans tubes », extraits synthétisés. */
export async function loadDemoThemes(): Promise<EngineTheme[]> {
  return getDemoThemes()
}

/** Extraits de démonstration : synthétisés à la volée, aucun fichier à télécharger. */
export const DEMO_MEDIA_PREFIX = 'demo://'

/**
 * URL des extraits audio à précharger avant la partie (lecture sans blanc). Les
 * images et vidéos (liens externes) et les extraits de démo ne se préchargent pas.
 */
export function collectMediaUrls(themes: EngineTheme[]): string[] {
  const urls = new Set<string>()
  for (const theme of themes) {
    for (const question of theme.questions) {
      const url = question.mediaUrl
      if (
        url &&
        question.mediaType === QUESTION_MEDIA_TYPE_AUDIO &&
        !url.startsWith(DEMO_MEDIA_PREFIX)
      ) {
        urls.add(url)
      }
    }
  }
  return [...urls]
}
