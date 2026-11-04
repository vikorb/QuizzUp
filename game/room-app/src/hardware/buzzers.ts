import {
  BUZZER_BUTTONS,
  type BuzzerKeymap,
  createDefaultKeymap,
  type Desk,
  DESKS as ALL_DESKS_LIST,
  desksForCount,
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
 * Tous les pupitres que l'écran de salle sait afficher (6 au maximum). Ceux d'une salle donnée
 * sont les `desksCount` premiers (`useRoomHardware().desks`, 4 par défaut).
 */
export const ALL_DESKS: readonly Desk[] = ALL_DESKS_LIST

export type DeskNumber = Desk

/** Le numéro est celui d'un pupitre connu (1 à 6). */
export function isDeskNumber(value: number): value is DeskNumber {
  return (ALL_DESKS as readonly number[]).includes(value)
}

/**
 * Mapping utilisé tant qu'aucun buzzer n'est associé : une rangée du clavier par
 * pupitre (1-4, Q-R, A-F, Z-V, puis 5-8 et T-I), pour jouer sans matériel.
 */
export function createSimulationKeymap(desksCount: number): BuzzerKeymap {
  return createDefaultKeymap(desksForCount(desksCount))
}

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
  // Seules les lettres : sans Maj, les chiffres AZERTY donneraient & é " '.
  const printed = code.startsWith('Key') ? keyboardLayout.value?.get(code) : undefined
  return printed && printed.trim() ? printed.toUpperCase() : code.replace(/^(Digit|Key|Numpad)/, '')
}

/** Touches d'un pupitre dans l'ordre A-D (`?` pour un buzzer non associé). */
export function getDeskKeys(keymap: Readonly<BuzzerKeymap>, desk: DeskNumber): string[] {
  return BUZZER_BUTTONS.map((button) => {
    const code = findCode(keymap, desk, button)
    return code ? formatKeyCode(code) : '?'
  })
}
