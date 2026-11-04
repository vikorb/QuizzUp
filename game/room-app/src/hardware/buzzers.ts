import {
  BUZZER_BUTTONS,
  type BuzzerKeymap,
  createDefaultKeymap,
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
export { BUZZER_BUTTONS, DESKS } from '@quizzup/hardware'

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
