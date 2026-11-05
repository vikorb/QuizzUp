import type { Desk } from './types'
import { desksForCount } from './types'

/** Position normalisée sur le plan de salle : 0 à 1, origine en haut à gauche (vue du dessus). */
export type PlanPoint = { x: number; y: number }

/**
 * Plan de salle (`config.plan`) : seules les positions déjà réglées sont enregistrées, les autres
 * reprennent leur place par défaut (`resolveRoomPlan`). L'écran a toujours une place.
 */
export type RoomPlan = {
  screen: PlanPoint
  desks: Partial<Record<Desk, PlanPoint>>
  fixtures: Record<string, PlanPoint>
}

/** Ce qu'on peut déplacer sur le plan. */
export type PlanTarget =
  { kind: 'screen' } | { kind: 'desk'; id: Desk } | { kind: 'fixture'; id: string }

export const DEFAULT_SCREEN_POINT: Readonly<PlanPoint> = { x: 0.5, y: 0.08 }

const DESK_ROW_Y = 0.72
const FIXTURE_ROW_Y = 0.28

export const defaultRoomPlan = (): RoomPlan => ({
  screen: { ...DEFAULT_SCREEN_POINT },
  desks: {},
  fixtures: {},
})

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/** Point valide (x et y numériques, ramenés dans [0,1]) ou `undefined`. */
function parsePoint(input: unknown): PlanPoint | undefined {
  const raw = asRecord(input)
  return typeof raw.x === 'number' &&
    typeof raw.y === 'number' &&
    Number.isFinite(raw.x) &&
    Number.isFinite(raw.y)
    ? { x: clamp01(raw.x), y: clamp01(raw.y) }
    : undefined
}

/**
 * Relit `config.plan`. Une position absente ou invalide est écartée (donc par défaut), une valeur
 * hors [0,1] est ramenée dans les bornes, les pupitres au-delà de `desksCount` et les appareils
 * inconnus sont retirés.
 */
export function parseRoomPlan(
  input: unknown,
  desksCount: number,
  fixtureIds: readonly string[]
): RoomPlan {
  const raw = asRecord(input)
  const rawDesks = asRecord(raw.desks)
  const rawFixtures = asRecord(raw.fixtures)
  const plan = defaultRoomPlan()
  plan.screen = parsePoint(raw.screen) ?? plan.screen
  for (const desk of desksForCount(desksCount)) {
    const point = parsePoint(rawDesks[String(desk)])
    if (point) {
      plan.desks[desk] = point
    }
  }
  for (const id of fixtureIds) {
    const point = Object.hasOwn(rawFixtures, id) ? parsePoint(rawFixtures[id]) : undefined
    if (point) {
      plan.fixtures[id] = point
    }
  }
  return plan
}

/** `count` positions réparties sur une rangée : (i + 1) / (count + 1). */
const spread = (index: number, count: number) => (index + 1) / (count + 1)

/**
 * Plan complet pour l'affichage : chaque pupitre et chaque appareil a une place. Par défaut, les
 * pupitres sont en rangée face à l'écran et les appareils répartis en haut de la salle.
 */
export function resolveRoomPlan(
  plan: RoomPlan,
  desksCount: number,
  fixtureIds: readonly string[]
): { screen: PlanPoint; desks: Record<number, PlanPoint>; fixtures: Record<string, PlanPoint> } {
  const desks = desksForCount(desksCount)
  return {
    screen: plan.screen,
    desks: Object.fromEntries(
      desks.map((desk, index) => [
        desk,
        plan.desks[desk] ?? { x: spread(index, desks.length), y: DESK_ROW_Y },
      ])
    ),
    fixtures: Object.fromEntries(
      fixtureIds.map((id, index) => [
        id,
        plan.fixtures[id] ?? { x: spread(index, fixtureIds.length), y: FIXTURE_ROW_Y },
      ])
    ),
  }
}

/** Enregistre la position d'un élément du plan, ramenée dans [0,1]. */
export function withPlanPoint(plan: RoomPlan, target: PlanTarget, point: PlanPoint): RoomPlan {
  const next = { x: clamp01(point.x), y: clamp01(point.y) }
  if (target.kind === 'screen') {
    return { ...plan, screen: next }
  }
  return target.kind === 'desk'
    ? { ...plan, desks: { ...plan.desks, [target.id]: next } }
    : { ...plan, fixtures: { ...plan.fixtures, [target.id]: next } }
}
