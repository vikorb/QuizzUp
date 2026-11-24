import { clampByte } from '../types'
import type { SceneAim, SceneColor, SceneDefinition, SceneStep, SceneTarget } from './scenes'
import { DEFAULT_SCENES, MIN_FLASH_INTERVAL_MS, SCENE_IDS, stepDuration } from './scenes'
import { SMOKE_HARD_LIMITS } from './smoke'

/**
 * Bornes d'une scène réglée par une salle (`lighting.scenes`). Elles sont dans le code, pas dans la
 * config : une salle règle ses scènes, jamais ces plafonds. L'écart minimal entre deux éclairs est
 * `MIN_FLASH_INTERVAL_MS` (400 ms), pas les 334 ms de la conception : la marge de latence d'émission
 * prime (voir `scenes.ts`).
 */
export const SCENE_LIMITS = {
  maxScenes: 24,
  maxSteps: 16,
  /** Durée minimale de l'allumé et de l'éteint d'un flash. */
  minFlashPhaseMs: 60,
  /** Durée maximale d'une étape `flash` (nombre d'éclairs × période). */
  maxFlashStepMs: 5_000,
  /** Durée minimale d'une boucle (somme des étapes des scènes qui bouclent). */
  minLoopMs: 200,
  maxPriority: 60,
  /** Une scène qui boucle ne doit jamais couvrir une scène de jeu (20 et plus). */
  maxLoopPriority: 10,
} as const

/** Priorité d'une scène de salle qui n'en donne pas : la plus basse après le repos. */
const DEFAULT_PRIORITY = 10

export type ParsedScenes = {
  /** Scènes valides, bornées (surcharges par `id` des scènes par défaut, ou scènes ajoutées). */
  scenes: SceneDefinition[]
  /** Ce qui a été écarté ou ramené, à afficher dans l'écran de configuration (rien n'est bloquant). */
  problems: string[]
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** Durée facultative : absente = 0, sinon un nombre fini et positif ou nul (`null` = invalide). */
const optionalDuration = (value: unknown): number | null =>
  value === undefined ? 0 : isFiniteNumber(value) && value >= 0 ? value : null

function parseColor(value: unknown): SceneColor | null {
  if (value === 'desk') {
    return 'desk'
  }
  const raw = asRecord(value)
  if (!raw || !isFiniteNumber(raw.r) || !isFiniteNumber(raw.g) || !isFiniteNumber(raw.b)) {
    return null
  }
  if (raw.w !== undefined && !isFiniteNumber(raw.w)) {
    return null
  }
  return {
    r: clampByte(raw.r),
    g: clampByte(raw.g),
    b: clampByte(raw.b),
    ...(raw.w === undefined ? {} : { w: clampByte(raw.w) }),
  }
}

/** `undefined` = pas de cible (toute la salle) ; `null` = valeur invalide. */
function parseTarget(value: unknown): SceneTarget | undefined | null {
  if (value === undefined || value === 'all' || value === 'desk' || value === 'others') {
    return value
  }
  if (Array.isArray(value) && value.every((id) => typeof id === 'string')) {
    return [...(value as string[])]
  }
  return null
}

/** Étape valide et bornée, ou `null` (étape écartée, problème ajouté). */
function parseStep(input: unknown, label: string, problems: string[]): SceneStep | null {
  const raw = asRecord(input)
  const reject = (why: string) => {
    problems.push(`${label} : étape écartée (${why})`)
    return null
  }
  if (!raw) {
    return reject('ce n’est pas un objet')
  }

  if (raw.type === 'smoke') {
    if (!isFiniteNumber(raw.durationMs)) {
      return reject('durée de fumée invalide')
    }
    const durationMs = Math.min(
      SMOKE_HARD_LIMITS.maxDurationMs,
      Math.max(SMOKE_HARD_LIMITS.minDurationMs, raw.durationMs)
    )
    if (durationMs !== raw.durationMs) {
      problems.push(`${label} : durée de fumée ramenée à ${durationMs} ms`)
    }
    return { type: 'smoke', durationMs }
  }
  if (raw.type === 'wait') {
    return isFiniteNumber(raw.durationMs) && raw.durationMs >= 0
      ? { type: 'wait', durationMs: raw.durationMs }
      : reject('durée d’attente invalide')
  }

  const fadeMs = optionalDuration(raw.fadeMs)
  const holdMs = optionalDuration(raw.holdMs)
  if (raw.type === 'blackout') {
    return fadeMs === null || holdMs === null
      ? reject('durée invalide')
      : {
          type: 'blackout',
          ...(raw.fadeMs === undefined ? {} : { fadeMs }),
          ...(raw.holdMs === undefined ? {} : { holdMs }),
        }
  }

  if (raw.type !== 'color' && raw.type !== 'flash') {
    return reject(`type inconnu : ${String(raw.type)}`)
  }
  const color = parseColor(raw.color)
  const target = parseTarget(raw.target)
  const aim: SceneAim | undefined | null =
    raw.aim === undefined || raw.aim === 'desk' || raw.aim === 'home' ? raw.aim : null
  if (color === null || target === null || aim === null) {
    return reject('couleur, cible ou visée invalide')
  }
  const common = {
    ...(target === undefined ? {} : { target }),
    color,
    ...(aim === undefined ? {} : { aim }),
  }

  if (raw.type === 'color') {
    const { intensity } = raw
    if (
      fadeMs === null ||
      holdMs === null ||
      (intensity !== undefined && !isFiniteNumber(intensity))
    ) {
      return reject('durée ou intensité invalide')
    }
    return {
      type: 'color',
      ...common,
      ...(intensity === undefined
        ? {}
        : { intensity: Math.min(1, Math.max(0, intensity as number)) }),
      ...(raw.fadeMs === undefined ? {} : { fadeMs }),
      ...(raw.holdMs === undefined ? {} : { holdMs }),
    }
  }

  if (
    !isFiniteNumber(raw.count) ||
    raw.count < 1 ||
    !isFiniteNumber(raw.onMs) ||
    !isFiniteNumber(raw.offMs)
  ) {
    return reject('nombre d’éclairs ou durées du flash invalides')
  }
  const onMs = Math.max(SCENE_LIMITS.minFlashPhaseMs, raw.onMs)
  // L'éteint est allongé pour tenir l'écart minimal entre deux éclairs, comme `flashPeriodMs`.
  const offMs = Math.max(SCENE_LIMITS.minFlashPhaseMs, raw.offMs, MIN_FLASH_INTERVAL_MS - onMs)
  const period = onMs + offMs
  if (period > SCENE_LIMITS.maxFlashStepMs) {
    return reject(`période du flash trop longue (${SCENE_LIMITS.maxFlashStepMs} ms au plus)`)
  }
  const count = Math.min(Math.floor(raw.count), Math.floor(SCENE_LIMITS.maxFlashStepMs / period))
  if (onMs !== raw.onMs || offMs !== raw.offMs || count !== raw.count) {
    problems.push(`${label} : flash ramené à ${count} × ${onMs}/${offMs} ms`)
  }
  return { type: 'flash', ...common, count, onMs, offMs }
}

/** Scène valide et bornée (sans `next` vérifié ni boucle), ou `null` (scène écartée). */
function parseScene(input: unknown, index: number, problems: string[]): SceneDefinition | null {
  const raw = asRecord(input)
  if (!raw || typeof raw.id !== 'string' || !raw.id) {
    problems.push(`Scène n° ${index + 1} : identifiant manquant, scène écartée`)
    return null
  }
  const id = raw.id
  const label = `Scène « ${id} »`
  if (id === SCENE_IDS.IDENTIFY) {
    problems.push(`${label} : la scène d’identification ne se surcharge pas, scène écartée`)
    return null
  }
  if (!Array.isArray(raw.steps)) {
    problems.push(`${label} : étapes manquantes, scène écartée`)
    return null
  }

  let steps = (raw.steps as unknown[])
    .map((step) => parseStep(step, label, problems))
    .filter((step) => step !== null)
  if (steps.length > SCENE_LIMITS.maxSteps) {
    problems.push(`${label} : ${SCENE_LIMITS.maxSteps} étapes au plus, les suivantes sont écartées`)
    steps = steps.slice(0, SCENE_LIMITS.maxSteps)
  }
  // Un seul jet par scène : le contrôleur de fumée refuserait le second pendant son repos.
  const firstSmoke = steps.findIndex((step) => step.type === 'smoke')
  const kept = steps.filter((step, at) => step.type !== 'smoke' || at === firstSmoke)
  if (kept.length !== steps.length) {
    problems.push(`${label} : une seule étape de fumée par scène, les autres sont écartées`)
  }
  if (kept.length === 0) {
    problems.push(`${label} : aucune étape valide, scène écartée`)
    return null
  }

  let priority = DEFAULT_PRIORITY
  if (raw.priority !== undefined) {
    if (isFiniteNumber(raw.priority)) {
      priority = Math.min(SCENE_LIMITS.maxPriority, Math.max(0, Math.round(raw.priority)))
    }
    if (priority !== raw.priority) {
      problems.push(`${label} : priorité ramenée à ${priority} (0 à ${SCENE_LIMITS.maxPriority})`)
    }
  }
  if (raw.next !== undefined && (typeof raw.next !== 'string' || !raw.next)) {
    problems.push(`${label} : « next » invalide, enchaînement écarté`)
  }
  return {
    id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : id,
    priority,
    steps: kept,
    ...(typeof raw.next === 'string' && raw.next ? { next: raw.next } : {}),
  }
}

/** Scènes qui bouclent : chaque scène a au plus un `next`, les boucles sont donc disjointes. */
function findLoops(byId: ReadonlyMap<string, SceneDefinition>): string[][] {
  const loops: string[][] = []
  const done = new Set<string>()
  for (const start of byId.keys()) {
    const path: string[] = []
    let id: string | undefined = start
    while (id !== undefined && byId.has(id) && !done.has(id)) {
      const at = path.indexOf(id)
      if (at >= 0) {
        loops.push(path.slice(at))
        break
      }
      path.push(id)
      id = byId.get(id)?.next
    }
    for (const visited of path) {
      done.add(visited)
    }
  }
  return loops
}

/**
 * Relit `lighting.scenes` de façon tolérante, comme `parseRig` : une scène ou une étape invalide est
 * écartée, une valeur hors borne est ramenée, et chaque écart est reporté dans `problems`. Une
 * salle ne stocke que les scènes qu'elle change ou ajoute (`id` identique = remplace la scène par
 * défaut), jamais le show complet (limite de taille de `rooms.config`).
 *
 * Sécurité, avec `SCENE_LIMITS` : flashs au moins `MIN_FLASH_INTERVAL_MS` d'écart, un seul jet de
 * fumée par scène (durée dans `SMOKE_HARD_LIMITS`) et aucun dans une boucle, boucle d'au moins
 * 200 ms et de priorité 10 au plus, scène `identify` non surchargeable. Le contrôleur de fumée
 * garde ses propres garde-fous (armement, durée maximale, repos, arrêt d'urgence, pause).
 *
 * ponytail : les scènes par défaut n'ont pas de `next`, donc une boucle ne passe jamais par l'une
 * d'elles et l'analyse se limite aux scènes de la salle. À refaire sur le graphe complet dès qu'une
 * scène par défaut en aura un (scène de sortie, lot H3).
 */
export function parseScenes(input: unknown): ParsedScenes {
  const problems: string[] = []
  if (input === undefined || input === null) {
    return { scenes: [], problems }
  }
  if (!Array.isArray(input)) {
    return { scenes: [], problems: ['lighting.scenes doit être une liste'] }
  }

  // Même `id` deux fois : la dernière l'emporte, comme le contrôleur.
  const byId = new Map<string, SceneDefinition>()
  input.forEach((raw: unknown, index) => {
    const scene = parseScene(raw, index, problems)
    if (!scene) {
      return
    }
    if (!byId.has(scene.id) && byId.size >= SCENE_LIMITS.maxScenes) {
      problems.push(
        `Scène « ${scene.id} » : ${SCENE_LIMITS.maxScenes} scènes au plus, scène écartée`
      )
      return
    }
    byId.set(scene.id, scene)
  })

  const known = new Set([...DEFAULT_SCENES.map((scene) => scene.id), ...byId.keys()])
  for (const scene of byId.values()) {
    if (scene.next !== undefined && !known.has(scene.next)) {
      problems.push(
        `Scène « ${scene.id} » : « next » vers une scène inconnue (${scene.next}), enchaînement écarté`
      )
      delete scene.next
    }
  }

  for (const loop of findLoops(byId)) {
    const members = loop.map((id) => byId.get(id) as SceneDefinition)
    const duration = members.reduce(
      (total, scene) => total + scene.steps.reduce((sum, step) => sum + stepDuration(step), 0),
      0
    )
    if (duration < SCENE_LIMITS.minLoopMs) {
      problems.push(
        `Boucle ${loop.join(' → ')} : durée de ${duration} ms, ${SCENE_LIMITS.minLoopMs} ms au moins, boucle écartée`
      )
      for (const scene of members) {
        delete scene.next
      }
      continue
    }
    for (const scene of members) {
      if (scene.priority > SCENE_LIMITS.maxLoopPriority) {
        problems.push(
          `Scène « ${scene.id} » : scène qui boucle, priorité ramenée à ${SCENE_LIMITS.maxLoopPriority}`
        )
        scene.priority = SCENE_LIMITS.maxLoopPriority
      }
      if (scene.steps.some((step) => step.type === 'smoke')) {
        problems.push(
          `Scène « ${scene.id} » : pas de fumée dans une boucle, étape de fumée écartée`
        )
        scene.steps = scene.steps.filter((step) => step.type !== 'smoke')
      }
    }
  }

  return { scenes: [...byId.values()], problems }
}
