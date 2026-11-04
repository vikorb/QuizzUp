import {
  BUZZER_BUTTONS,
  type BuzzerKeymap,
  createDefaultKeymap,
  DEFAULT_DESKS,
  type Desk,
  findCode,
} from '@quizzup/hardware'
import { shallowRef } from 'vue'

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

type KeyboardLayout = { get: (code: string) => string | undefined }
type LayoutNavigator = { keyboard?: { getLayoutMap?: () => Promise<KeyboardLayout> } }

/** Disposition réelle du clavier (AZERTY, QWERTZ…), quand le navigateur la donne. */
const keyboardLayout = shallowRef<KeyboardLayout | null>(null)

/**
 * Lit la disposition du clavier (Keyboard API, Chrome et Edge) : les touches
 * s'affichent alors comme gravées (`KeyQ` → `A` en AZERTY). Sans elle, on garde
 * les noms QWERTY des codes physiques.
 */
export async function loadKeyboardLayout(
  source: LayoutNavigator | undefined = globalThis.navigator as LayoutNavigator | undefined
): Promise<void> {
  try {
    const layout = await source?.keyboard?.getLayoutMap?.()
    keyboardLayout.value = layout ?? null
  } catch {
    keyboardLayout.value = null
  }
}

/** Libellé court d'une touche physique (`KeyQ` → `Q`, ou `A` en AZERTY ; `Digit1` → `1`). */
export function formatKeyCode(code: string): string {
  const printed = /^(Key|Digit)/.test(code) ? keyboardLayout.value?.get(code) : undefined
  return printed && printed.trim() ? printed.toUpperCase() : code.replace(/^(Digit|Key|Numpad)/, '')
}

/** Touches d'un pupitre dans l'ordre A-D (`?` pour un buzzer non associé). */
export function getDeskKeys(keymap: Readonly<BuzzerKeymap>, desk: DeskNumber): string[] {
  return BUZZER_BUTTONS.map((button) => {
    const code = findCode(keymap, desk, button)
    return code ? formatKeyCode(code) : '?'
  })
}
