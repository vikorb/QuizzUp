import {
  BUZZER_BUTTONS,
  type BuzzerKeymap,
  createDefaultKeymap,
  DEFAULT_DESKS,
  type Desk,
  findCode,
} from '@quizzup/hardware'

/**
 * Buzzers de la salle : contrat et clavier viennent de `game/hardware`. Ici, les
 * quelques aides propres à l'écran (touches affichées, mapping par défaut).
 */
export type {
  BuzzerButton,
  BuzzerInput,
  BuzzerInputState,
  BuzzerKeymap,
  BuzzerPress,
} from '@quizzup/hardware'
export { BUZZER_BUTTONS } from '@quizzup/hardware'

/**
 * Pupitres gérés par l'écran de salle : 4 en V1 (couleurs, lobby, test). Le paquet
 * matériel en connaît jusqu'à 6, en attente de décision.
 */
export const DESKS: readonly Desk[] = DEFAULT_DESKS

export type DeskNumber = Desk

/**
 * Mapping utilisé tant qu'aucun buzzer n'est associé : une rangée du clavier par
 * pupitre (1-4, Q-R, A-F, Z-V), pour jouer sans matériel.
 */
export const SIMULATION_KEYMAP: Readonly<BuzzerKeymap> = Object.freeze(createDefaultKeymap())

/** Libellé court d'une touche physique (`KeyQ` → `Q`, `Digit1` → `1`). */
export function formatKeyCode(code: string): string {
  return code.replace(/^(Digit|Key|Numpad)/, '')
}

/** Touches d'un pupitre dans l'ordre A-D (`?` pour un buzzer non associé). */
export function getDeskKeys(keymap: Readonly<BuzzerKeymap>, desk: DeskNumber): string[] {
  return BUZZER_BUTTONS.map((button) => {
    const code = findCode(keymap, desk, button)
    return code ? formatKeyCode(code) : '?'
  })
}
