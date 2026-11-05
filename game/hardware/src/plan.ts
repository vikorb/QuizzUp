import type { Desk } from './types'
import { DESKS, desksForCount } from './types'

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
/** Au-delà, les appareils non rattachés passent sur deux rangées pour rester lisibles. */
const FIXTURES_PER_ROW = 6
/** Écart entre un pupitre et ses appareils rattachés (au-dessus de lui). */
const LINKED_FIXTURE_GAP = 0.18
const LINKED_FIXTURE_SPACING = 0.1

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
 * hors [0,1] est ramenée dans les bornes, les appareils inconnus sont retirés. Les positions des
 * pupitres 1 à 6 sont conservées même au-delà de `desksCount` (réserve si on remonte le nombre de
 * pupitres) ; `resolveRoomPlan` ne garde que ceux qui existent.
 */
export function parseRoomPlan(input: unknown, fixtureIds: readonly string[]): RoomPlan {
  const raw = asRecord(input)
  const rawDesks = asRecord(raw.desks)
  const rawFixtures = asRecord(raw.fixtures)
  const plan = defaultRoomPlan()
  plan.screen = parsePoint(raw.screen) ?? plan.screen
  for (const desk of DESKS) {
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

/** Appareil à placer : son identifiant et le pupitre auquel il est rattaché, s'il y en a un. */
export type PlanFixture = { id: string; desk?: Desk }

/**
 * Plan complet pour l'affichage : chaque pupitre (de 1 à `desksCount`) et chaque appareil a une
 * place. Par défaut, les pupitres sont en rangée face à l'écran ; un appareil rattaché à un pupitre
 * se place juste au-dessus de lui, les autres sont répartis en haut de la salle (sur deux rangées
 * s'ils sont nombreux).
 */
export function resolveRoomPlan(
  plan: RoomPlan,
  desksCount: number,
  fixtures: readonly PlanFixture[]
): { screen: PlanPoint; desks: Record<number, PlanPoint>; fixtures: Record<string, PlanPoint> } {
  const deskList = desksForCount(desksCount)
  const desks: Record<number, PlanPoint> = Object.fromEntries(
    deskList.map((desk, index) => [
      desk,
      plan.desks[desk] ?? { x: spread(index, deskList.length), y: DESK_ROW_Y },
    ])
  )
  const isLinked = (fixture: PlanFixture) =>
    fixture.desk !== undefined && Boolean(desks[fixture.desk])
  const unlinked = fixtures.filter((fixture) => !isLinked(fixture))
  const rows = unlinked.length > FIXTURES_PER_ROW ? 2 : 1
  const perRow = Math.ceil(unlinked.length / rows)
  const placed: Record<string, PlanPoint> = {}
  for (const fixture of fixtures) {
    const saved = plan.fixtures[fixture.id]
    if (saved) {
      placed[fixture.id] = saved
    } else if (isLinked(fixture)) {
      const desk = desks[fixture.desk!]!
      const mates = fixtures.filter((other) => other.desk === fixture.desk)
      const offset = mates.findIndex((other) => other.id === fixture.id) - (mates.length - 1) / 2
      placed[fixture.id] = {
        x: clamp01(desk.x + offset * LINKED_FIXTURE_SPACING),
        y: clamp01(desk.y - LINKED_FIXTURE_GAP),
      }
    } else {
      const index = unlinked.indexOf(fixture)
      const row = Math.floor(index / perRow)
      placed[fixture.id] = {
        x: spread(index % perRow, Math.min(perRow, unlinked.length - row * perRow)),
        y: rows === 1 ? FIXTURE_ROW_Y : FIXTURE_ROW_Y - 0.08 + row * 0.16,
      }
    }
  }
  return { screen: plan.screen, desks, fixtures: placed }
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
