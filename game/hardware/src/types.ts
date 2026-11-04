/**
 * Pupitres possibles : jusqu'à 6, pour accueillir les salles déjà équipées de 6 pupitres
 * (voir `src/presets/sixDeskRoom.ts`). Une salle neuve en a 4 (`DEFAULT_DESKS`).
 */
export const DESKS = [1, 2, 3, 4, 5, 6] as const
export type Desk = (typeof DESKS)[number]

/** Pupitres d'une salle standard : apprentissage, mapping de démonstration. */
export const DEFAULT_DESKS: readonly Desk[] = [1, 2, 3, 4]

/** Buzzers d'un pupitre : A, B, C, D. */
export const BUZZER_BUTTONS = ['A', 'B', 'C', 'D'] as const
export type BuzzerButton = (typeof BUZZER_BUTTONS)[number]

/** Index d'un buzzer tel que l'attend le moteur de jeu : 0 = A, 1 = B, 2 = C, 3 = D. */
export type ButtonIndex = 0 | 1 | 2 | 3

export type Unsubscribe = () => void

export type Rgb = { r: number; g: number; b: number }

/** Couleur d'un appareil : composantes 0-255, blanc optionnel pour les PAR RGBW. */
export type Rgbw = Rgb & { w?: number }

export function isDesk(value: unknown): value is Desk {
  return typeof value === 'number' && (DESKS as readonly number[]).includes(value)
}

export function isBuzzerButton(value: unknown): value is BuzzerButton {
  return typeof value === 'string' && (BUZZER_BUTTONS as readonly string[]).includes(value)
}

export function buttonToIndex(button: BuzzerButton): ButtonIndex {
  return BUZZER_BUTTONS.indexOf(button) as ButtonIndex
}

export function clampByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(255, Math.max(0, Math.round(value)))
}
