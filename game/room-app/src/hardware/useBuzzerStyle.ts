import { BUZZER_CORNERS } from '@quizzup/hardware'

import type { BuzzerButton } from '@/hardware/buzzers'
import { useRoomHardware } from '@/hardware/roomHardware'

/**
 * Style d'une réponse ou d'une option selon le buzzer qui la désigne : `--answer-color` suit la
 * couleur configurée pour la salle. Avec `withPlace`, `order` suit aussi la place dans le carré
 * 2×2 du pupitre (tl, tr, bl, br) : une grille à deux colonnes reproduit alors la disposition
 * (A B / C D par défaut). Sans lettre (pupitre 5 ou 6, plus de buzzer), aucun style.
 */
export function useBuzzerStyle() {
  const { hardware } = useRoomHardware()

  function styleOf(letter: BuzzerButton | undefined, withPlace = false) {
    const style = letter && hardware.value.config.buzzers.layout[letter]
    return style
      ? {
          '--answer-color': `var(--buzzer-${style.color})`,
          ...(withPlace ? { order: BUZZER_CORNERS.indexOf(style.corner) } : {}),
        }
      : undefined
  }

  return { styleOf }
}
