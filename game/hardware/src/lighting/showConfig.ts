import { clampByte } from '../types'
import type {
  ExitLightConfig,
  SceneAim,
  SceneColor,
  SceneDefinition,
  SceneStep,
  SceneTarget,
} from './scenes'
import {
  DEFAULT_EXIT,
  DEFAULT_SCENES,
  MIN_FLASH_INTERVAL_MS,
  SCENE_IDS,
  stepDuration,
} from './scenes'
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
  /** Durée maximale d'une attente, d'un fondu ou d'un maintien (sinon une scène bloque les autres). */
  maxStepMs: 10 * 60_000,
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
  /** Durée facultative : absente = 0, plafonnée à `maxStepMs` (signalé), `null` si invalide. */
  const duration = (value: unknown, what: string): number | null => {
    if (value === undefined) {
      return 0
    }
    if (!isFiniteNumber(value) || value < 0) {
      return null
    }
    if (value > SCENE_LIMITS.maxStepMs) {
      problems.push(`${label} : ${what} ramenée à ${SCENE_LIMITS.maxStepMs} ms`)
      return SCENE_LIMITS.maxStepMs
    }
    return value
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
    const durationMs = raw.durationMs === undefined ? null : duration(raw.durationMs, 'attente')
    return durationMs === null ? reject('durée d’attente invalide') : { type: 'wait', durationMs }
  }

  const fadeMs = duration(raw.fadeMs, 'fondu')
  const holdMs = duration(raw.holdMs, 'maintien')
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
  // Sécurité : la lumière de sortie ne jette jamais de fumée, quelle que soit la chaîne (fin d'une
  // partie incomplète, bouton « Éteindre la sortie »). Les pas `smoke` sont retirés, et signalés.
  if (
    (id === SCENE_IDS.EXIT || id === SCENE_IDS.EXIT_OFF) &&
    steps.some((step) => step.type === 'smoke')
  ) {
    problems.push(`${label} : pas de fumée dans la sortie, étape de fumée écartée`)
    steps = withoutSmoke(steps)
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
 * fumée par scène et par chaîne `next` (durée dans `SMOKE_HARD_LIMITS`) et aucun dans une boucle,
 * boucle d'au moins 200 ms et de priorité 10 au plus, attente, fondu et maintien de 10 minutes au
 * plus, scène `identify` non surchargeable. Le contrôleur de fumée
 * garde ses propres garde-fous (armement, durée maximale, repos, arrêt d'urgence, pause).
 *
 * Les boucles se cherchent sur le graphe complet (scènes par défaut comprises : victoire → sortie →
 * extinction). Une boucle qui passe par une scène par défaut non remplacée ne peut pas être bornée
 * (on ne modifie pas les scènes livrées) : les `next` des scènes de la salle qui la forment sont
 * retirés.
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

  const whole = new Map<string, SceneDefinition>([
    ...DEFAULT_SCENES.map((scene): [string, SceneDefinition] => [scene.id, scene]),
    ...byId,
  ])
  for (const loop of findLoops(whole)) {
    if (loop.some((id) => !byId.has(id))) {
      problems.push(
        `Boucle ${loop.join(' → ')} : elle passe par une scène par défaut, boucle écartée`
      )
      for (const id of loop) {
        delete byId.get(id)?.next
      }
      continue
    }
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
        scene.steps = withoutSmoke(scene.steps)
      }
    }
  }

  limitSmokeToOnePerChain(byId, problems)

  return { scenes: [...byId.values()], problems }
}

/** Les pas sans fumée ; une scène ne reste jamais vide (elle ne survivrait pas à une relecture). */
function withoutSmoke(steps: SceneStep[]): SceneStep[] {
  const kept = steps.filter((step) => step.type !== 'smoke')
  return kept.length > 0 ? kept : [{ type: 'wait', durationMs: 0 }]
}

/**
 * Un seul jet de fumée par événement, même par une chaîne `next` sans boucle (s1 → s2 → s3 : trois
 * jets sinon). On suit la chaîne de chaque scène (`maxScenes` sauts au plus) : seule la première
 * fumée rencontrée reste, les pas `smoke` des scènes atteintes après elle sont retirés. Une scène par
 * défaut qui a de la fumée (victoire) ne peut pas être modifiée : la scène de salle qui y mène perd
 * alors son `next`.
 */
function limitSmokeToOnePerChain(
  byId: ReadonlyMap<string, SceneDefinition>,
  problems: string[]
): void {
  const whole = [...DEFAULT_SCENES.filter((scene) => !byId.has(scene.id)), ...byId.values()]
  const hasSmoke = (scene: SceneDefinition) => scene.steps.some((step) => step.type === 'smoke')
  // Les scènes par défaut aussi : `victory` (fumée) enchaîne `exit`, qu'une salle peut remplacer.
  for (const start of whole) {
    let smoked = false
    let scene: SceneDefinition | undefined = start
    for (let hops = 0; scene && hops <= SCENE_LIMITS.maxScenes; hops += 1) {
      if (hasSmoke(scene)) {
        if (!smoked) {
          smoked = true
        } else if (byId.has(scene.id)) {
          problems.push(
            `Scène « ${scene.id} » : déjà une fumée plus tôt dans la chaîne « next », étape de fumée écartée`
          )
          scene.steps = withoutSmoke(scene.steps)
        }
      }
      const nextId: string | undefined = scene.next
      const next: SceneDefinition | undefined =
        nextId === undefined
          ? undefined
          : (byId.get(nextId) ?? DEFAULT_SCENES.find((entry) => entry.id === nextId))
      if (smoked && next && !byId.has(next.id) && hasSmoke(next)) {
        problems.push(
          `Scène « ${scene.id} » : « next » vers ${next.id}, qui a de la fumée alors que la chaîne en a déjà une, enchaînement écarté`
        )
        if (byId.has(scene.id)) {
          delete scene.next
        }
        break
      }
      scene = next
    }
  }
}

export type ParsedExit = {
  /** `undefined` : bloc absent ou illisible, les valeurs par défaut s'appliquent. */
  exit: ExitLightConfig | undefined
  problems: string[]
}

/**
 * Relit `lighting.exit` de façon tolérante : champ absent ou invalide = valeur par défaut
 * (`DEFAULT_EXIT`), durée ramenée à `maxStepMs` au plus, intensité dans 0..1. Une configuration
 * d'avant ce bloc reste donc valide et donne la lumière de sortie par défaut.
 */
export function parseExit(input: unknown): ParsedExit {
  const problems: string[] = []
  if (input === undefined || input === null) {
    return { exit: undefined, problems }
  }
  const raw = asRecord(input)
  if (!raw) {
    return { exit: undefined, problems: ['lighting.exit doit être un objet'] }
  }

  const duration = (value: unknown, fallback: number, name: string) => {
    if (value === undefined) {
      return fallback
    }
    if (!isFiniteNumber(value) || value < 0) {
      problems.push(`lighting.exit.${name} invalide, ${fallback} ms utilisé`)
      return fallback
    }
    if (value > SCENE_LIMITS.maxStepMs) {
      problems.push(`lighting.exit.${name} ramené à ${SCENE_LIMITS.maxStepMs} ms`)
      return SCENE_LIMITS.maxStepMs
    }
    return value
  }

  let enabled = DEFAULT_EXIT.enabled
  if (typeof raw.enabled === 'boolean') {
    enabled = raw.enabled
  } else if (raw.enabled !== undefined) {
    problems.push('lighting.exit.enabled invalide, lumière de sortie activée')
  }

  let intensity = DEFAULT_EXIT.intensity
  if (isFiniteNumber(raw.intensity)) {
    intensity = Math.min(1, Math.max(0, raw.intensity))
    if (intensity !== raw.intensity) {
      problems.push(`lighting.exit.intensity ramenée à ${intensity} (0 à 1)`)
    }
  } else if (raw.intensity !== undefined) {
    problems.push(`lighting.exit.intensity invalide, ${intensity} utilisé`)
  }

  let color: SceneColor | null = { ...DEFAULT_EXIT.color }
  if (raw.color !== undefined) {
    // La couleur « pupitre » n'a pas de sens pour la sortie : elle est refusée comme une couleur invalide.
    color = raw.color === 'desk' ? null : parseColor(raw.color)
    if (color === null) {
      problems.push('lighting.exit.color invalide, blanc chaud utilisé')
      color = { ...DEFAULT_EXIT.color }
    }
  }

  // Signalé sans être corrigé : la salle choisit sa lumière, mais une sortie éteinte est sans doute une erreur.
  if (intensity === 0) {
    problems.push('lighting.exit.intensity à 0 : la lumière de sortie n’éclairera pas')
  }
  const fixed = color as ExitLightConfig['color']
  if (fixed.r === 0 && fixed.g === 0 && fixed.b === 0 && !fixed.w) {
    problems.push('lighting.exit.color noire : la lumière de sortie n’éclairera pas')
  }

  return {
    exit: {
      enabled,
      delayMs: duration(raw.delayMs, DEFAULT_EXIT.delayMs, 'delayMs'),
      holdMs: duration(raw.holdMs, DEFAULT_EXIT.holdMs, 'holdMs'),
      intensity,
      color: fixed,
    },
    problems,
  }
}
