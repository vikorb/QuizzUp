import type { BuzzerButton } from '../types'
import { BUZZER_BUTTONS } from '../types'

/** Couleurs physiques possibles d'un buzzer (palette fixe, les teintes sont décidées par l'écran). */
export const BUZZER_COLORS = [
  'green',
  'red',
  'blue',
  'yellow',
  'white',
  'orange',
  'purple',
  'pink',
] as const
export type BuzzerColor = (typeof BUZZER_COLORS)[number]

/** Place dans le carré 2×2 d'un pupitre : haut/bas, gauche/droite. */
export const BUZZER_CORNERS = ['tl', 'tr', 'bl', 'br'] as const
export type BuzzerCorner = (typeof BUZZER_CORNERS)[number]

export type BuzzerStyle = { color: BuzzerColor; corner: BuzzerCorner }

/** Couleur et place de chaque buzzer, identiques pour tous les pupitres de la salle. */
export type BuzzerLayout = Record<BuzzerButton, BuzzerStyle>

/** Défaut : A en haut à gauche, B en haut à droite, C en bas à gauche, D en bas à droite. */
export const DEFAULT_BUZZER_LAYOUT: Readonly<BuzzerLayout> = {
  A: { color: 'blue', corner: 'tl' },
  B: { color: 'purple', corner: 'tr' },
  C: { color: 'green', corner: 'bl' },
  D: { color: 'yellow', corner: 'br' },
}

/** Copie profonde (`structuredClone` refuse les objets réactifs de Vue). */
export const cloneBuzzerLayout = (layout: BuzzerLayout): BuzzerLayout =>
  Object.fromEntries(
    BUZZER_BUTTONS.map((button) => [button, { ...layout[button] }])
  ) as BuzzerLayout

export const defaultBuzzerLayout = (): BuzzerLayout => cloneBuzzerLayout(DEFAULT_BUZZER_LAYOUT)

const isColor = (value: unknown): value is BuzzerColor =>
  (BUZZER_COLORS as readonly unknown[]).includes(value)
const isCorner = (value: unknown): value is BuzzerCorner =>
  (BUZZER_CORNERS as readonly unknown[]).includes(value)
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/**
 * Relit `buzzers.layout` : une couleur absente ou hors palette reprend celle du défaut ; si les
 * places ne sont pas quatre coins distincts (doublon, valeur inconnue), les quatre reprennent le
 * défaut.
 */
export function parseBuzzerLayout(input: unknown, problems: string[] = []): BuzzerLayout {
  const raw = asRecord(input)
  const layout = defaultBuzzerLayout()
  const corners: unknown[] = []
  for (const button of BUZZER_BUTTONS) {
    const item = asRecord(raw[button])
    if (isColor(item.color)) {
      layout[button].color = item.color
    } else if (item.color !== undefined) {
      problems.push(`Couleur du buzzer ${button} inconnue : ${String(item.color)}`)
    }
    corners.push(item.corner)
  }
  if (corners.every(isCorner) && new Set(corners).size === BUZZER_BUTTONS.length) {
    for (const [index, button] of BUZZER_BUTTONS.entries()) {
      layout[button].corner = corners[index] as BuzzerCorner
    }
  } else if (corners.some((corner) => corner !== undefined)) {
    problems.push('Disposition des buzzers invalide (quatre places distinctes attendues)')
  }
  return layout
}

/** Le buzzer posé à chaque coin du carré, pour dessiner la grille. */
export function buttonsByCorner(layout: BuzzerLayout): Record<BuzzerCorner, BuzzerButton> {
  return Object.fromEntries(
    BUZZER_BUTTONS.map((button) => [layout[button].corner, button])
  ) as Record<BuzzerCorner, BuzzerButton>
}

/** Pose `button` sur `corner` ; le buzzer qui l'occupait prend l'ancienne place (jamais de doublon). */
export function moveBuzzerToCorner(
  layout: BuzzerLayout,
  button: BuzzerButton,
  corner: BuzzerCorner
): BuzzerLayout {
  const occupant = buttonsByCorner(layout)[corner]
  const next = cloneBuzzerLayout(layout)
  next[occupant].corner = layout[button].corner
  next[button].corner = corner
  return next
}
