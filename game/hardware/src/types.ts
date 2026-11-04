/**
 * Pupitres possibles : jusqu'à 6, pour accueillir les salles déjà équipées de 6 pupitres
 * (voir `src/presets/sixDeskRoom.ts`). Une salle neuve en a 4 (`DEFAULT_DESKS`).
 */
export const DESKS = [1, 2, 3, 4, 5, 6] as const
export type Desk = (typeof DESKS)[number]

/** Pupitres d'une salle standard : apprentissage, mapping de démonstration. */
export const DEFAULT_DESKS: readonly Desk[] = [1, 2, 3, 4]

/** Nombre de pupitres d'une salle neuve (réglable de 1 à `DESKS.length` dans `rooms.config`). */
export const DEFAULT_DESK_COUNT = DEFAULT_DESKS.length

/**
 * Nombre de pupitres valide : entier de 1 à 6. Valeur absente, non numérique ou non finie :
 * `DEFAULT_DESK_COUNT` ; décimale ou hors bornes : ramenée dans 1..6.
 */
export function clampDeskCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DESK_COUNT
  }
  return Math.min(DESKS.length, Math.max(1, Math.trunc(value)))
}

/** Les `count` premiers pupitres : 1 à `count` (nombre ramené dans 1..6). */
export function desksForCount(count: unknown): Desk[] {
  return DESKS.slice(0, clampDeskCount(count))
}

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
