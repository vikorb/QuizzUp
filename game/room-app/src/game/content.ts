import type { EngineTheme } from '@quizzup/game-engine'

import { getDemoThemes } from '@/game/demoContent'

/**
 * Source du contenu d'une partie (thèmes + questions audio de la compagnie).
 * Tant que l'API « contenu de la salle » n'existe pas (US-ROOM-02 / US-MEDIA-01),
 * la salle joue le contenu de démonstration, connecté ou non.
 */
export async function loadRoomThemes(): Promise<EngineTheme[]> {
  return getDemoThemes()
}

/** URL des extraits à précharger avant la partie (lecture sans blanc, hors ligne). */
export function collectMediaUrls(themes: EngineTheme[]): string[] {
  const urls = new Set<string>()
  for (const theme of themes) {
    for (const question of theme.questions) {
      if (question.mediaUrl) {
        urls.add(question.mediaUrl)
      }
    }
  }
  return [...urls]
}
