import type { FixtureState, ResolvedFixture } from '../dmx/fixtures'
import { darkState, isLightFixture } from '../dmx/fixtures'
import type { Desk, Rgb, Rgbw } from '../types'
import type {
  SceneAim,
  SceneColor,
  SceneContext,
  SceneDefinition,
  SceneStep,
  SceneTarget,
} from './scenes'
import { FLASH_HIGH_LEVEL, MIN_FLASH_INTERVAL_MS, stepDuration } from './scenes'

export type ScenePlayerOptions = {
  fixtures: readonly ResolvedFixture[]
  deskColors: Record<Desk, Rgb>
  /** Appelé pour une étape `smoke` : le contrôleur décide (sécurité). */
  onSmoke: (durationMs: number) => void
}

export type ScenePlayer = {
  /** Lance une scène ; refusée (false) si une scène plus prioritaire est en cours. */
  play: (scene: SceneDefinition, context: SceneContext, now: number) => boolean
  /** Fait avancer la scène et met à jour l'état des appareils. */
  update: (now: number) => void
  stop: () => void
  /** Éteint tout immédiatement (arrêt d'urgence). */
  blackout: () => void
  currentSceneId: () => string | null
  states: () => ReadonlyMap<string, FixtureState>
}

type Active = {
  scene: SceneDefinition
  context: SceneContext
  stepIndex: number
  stepStartedAt: number
  from: Map<string, FixtureState>
}

const MAX_INSTANT_STEPS = 64
const LATE_SMOKE_TOLERANCE_MS = 500

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress

const lerpColor = (from: Rgbw, to: Rgbw, progress: number): Rgbw => ({
  r: lerp(from.r, to.r, progress),
  g: lerp(from.g, to.g, progress),
  b: lerp(from.b, to.b, progress),
  w: lerp(from.w ?? 0, to.w ?? 0, progress),
})

const cloneState = (state: FixtureState): FixtureState => ({
  color: { ...state.color },
  intensity: state.intensity,
  position: state.position ? { ...state.position } : null,
  strobe: state.strobe,
})

export function createScenePlayer(options: ScenePlayerOptions): ScenePlayer {
  const lights = options.fixtures.filter(isLightFixture)
  const current = new Map<string, FixtureState>(lights.map((fixture) => [fixture.id, darkState()]))
  let active: Active | null = null

  // Sécurité (photosensibilité) : plafond d'éclairs par seconde, tenu ici pour toute scène (par
  // défaut, réglée par une salle, bouclée ou enchaînée). Un « éclair » est le passage d'un appareil
  // du niveau bas au niveau haut (cf. `FLASH_HIGH_LEVEL`). Tout état écrit sur un appareil passe
  // par `commit` : un passage au niveau haut moins de `MIN_FLASH_INTERVAL_MS` après le précédent est
  // retenu dans `held` (l'appareil garde son niveau bas) et appliqué dès que le plafond le permet,
  // sauf si une étape a écrit autre chose entre-temps (flash terminé : il est alors perdu).
  const lastRiseAt = new Map<string, number>()
  const held = new Map<string, FixtureState>()

  const isHigh = (state: FixtureState) => state.intensity >= FLASH_HIGH_LEVEL

  const commit = (id: string, next: FixtureState, now: number) => {
    const previous = current.get(id)
    const rising = isHigh(next) && !(previous && isHigh(previous))
    const last = lastRiseAt.get(id)
    if (rising && last !== undefined && now - last < MIN_FLASH_INTERVAL_MS) {
      held.set(id, next)
      return
    }
    if (rising) {
      lastRiseAt.set(id, now)
    }
    held.delete(id)
    current.set(id, next)
  }

  // Sécurité : un stroboscope n'est jamais piloté par une cible générale (`all`, `desk`, `others`),
  // seulement par une liste qui le nomme. Sans cela, son canal « strobe » à 0 le laisserait allumé
  // en continu (lampe fixe) pendant toute la partie.
  const generalLights = lights.filter((fixture) => fixture.profile.kind !== 'strobe')

  const deskFixtures = (desk: Desk | null) =>
    desk === null
      ? []
      : generalLights.filter(
          (fixture) =>
            fixture.desk === desk ||
            (fixture.profile.kind === 'movingHead' && fixture.deskPositions?.[desk] !== undefined)
        )

  const resolveTargets = (target: SceneTarget | undefined, context: SceneContext) => {
    if (Array.isArray(target)) {
      return lights.filter((fixture) => target.includes(fixture.id))
    }
    const own = deskFixtures(context.desk)
    // Pupitre connu mais sans aucun appareil : repli lisible, toute la salle prend son rôle et
    // « les autres » est vide (sinon le buzz ou la victoire assombrirait toute la salle).
    const noDeskFixture = context.desk !== null && own.length === 0
    if (target === 'desk') {
      return noDeskFixture ? generalLights : own
    }
    if (target === 'others') {
      if (noDeskFixture) {
        return []
      }
      const excluded = new Set(own.map((fixture) => fixture.id))
      return generalLights.filter((fixture) => !excluded.has(fixture.id))
    }
    return generalLights
  }

  const resolveColor = (color: SceneColor, context: SceneContext): Rgbw => {
    if (color !== 'desk') {
      return color
    }
    return context.desk === null ? { r: 255, g: 255, b: 255 } : options.deskColors[context.desk]
  }

  const resolvePosition = (
    fixture: ResolvedFixture,
    aim: SceneAim | undefined,
    context: SceneContext,
    fallback: FixtureState['position']
  ) => {
    if (fixture.profile.kind !== 'movingHead' || aim === undefined) {
      return fallback
    }
    if (aim === 'home' || context.desk === null) {
      return null
    }
    return fixture.deskPositions?.[context.desk] ?? fallback
  }

  const applyStep = (step: SceneStep, entry: Active, elapsed: number, now: number) => {
    const { context, from } = entry
    if (step.type === 'smoke' || step.type === 'wait') {
      return
    }
    if (step.type === 'blackout') {
      const fade = Math.max(0, step.fadeMs ?? 0)
      const progress = fade === 0 ? 1 : Math.min(1, elapsed / fade)
      for (const fixture of lights) {
        const start = from.get(fixture.id) ?? darkState()
        commit(
          fixture.id,
          { ...cloneState(start), intensity: lerp(start.intensity, 0, progress), strobe: 0 },
          now
        )
      }
      return
    }

    const color = resolveColor(step.color, context)
    for (const fixture of resolveTargets(step.target, context)) {
      const start = from.get(fixture.id) ?? darkState()
      const position = resolvePosition(fixture, step.aim, context, start.position)

      if (step.type === 'color') {
        const fade = Math.max(0, step.fadeMs ?? 0)
        const progress = fade === 0 ? 1 : Math.min(1, elapsed / fade)
        commit(
          fixture.id,
          {
            color: lerpColor(start.color, color, progress),
            intensity: lerp(start.intensity, step.intensity ?? 1, progress),
            position,
            strobe: 0,
          },
          now
        )
        continue
      }

      // Flash : alterne la couleur et l'état d'avant, puis revient à l'état d'avant.
      const period = Math.max(1, step.onMs + step.offMs)
      const lit = elapsed < stepDuration(step) && elapsed % period < step.onMs
      commit(
        fixture.id,
        lit
          ? { color: { ...color }, intensity: 1, position, strobe: 0 }
          : { ...cloneState(start), position },
        now
      )
    }
  }

  const enterStep = (entry: Active, index: number, at: number, now: number): Active => {
    const next: Active = {
      ...entry,
      stepIndex: index,
      stepStartedAt: at,
      from: new Map([...current].map(([id, state]) => [id, cloneState(state)])),
    }
    const step = next.scene.steps[index]
    // Après un gel de la page, on rattrape les étapes sans déclencher une fumée « en retard ».
    if (step?.type === 'smoke' && now - at <= LATE_SMOKE_TOLERANCE_MS) {
      options.onSmoke(step.durationMs)
    }
    return next
  }

  const advance = (now: number) => {
    let entry = active
    if (!entry) {
      return
    }
    const maxSteps = MAX_INSTANT_STEPS + entry.scene.steps.length
    for (let guard = 0; guard < maxSteps; guard += 1) {
      const step = entry.scene.steps[entry.stepIndex]
      if (!step) {
        active = null
        return
      }
      const duration = stepDuration(step)
      const elapsed = now - entry.stepStartedAt
      applyStep(step, entry, Math.min(elapsed, duration), now)
      if (elapsed < duration) {
        return
      }
      entry = enterStep(entry, entry.stepIndex + 1, entry.stepStartedAt + duration, now)
      active = entry
    }
  }

  const update = (now: number) => {
    advance(now)
    // Applique les états retenus par le plafond d'éclairs que le temps écoulé rend maintenant permis
    // (y compris quand plus aucune scène ne tourne : l'état final d'une scène ne se perd pas).
    for (const [id, state] of held) {
      commit(id, state, now)
    }
  }

  return {
    play(scene, context, now) {
      if (active && scene.priority < active.scene.priority) {
        return false
      }
      held.clear()
      const entry: Active = { scene, context, stepIndex: 0, stepStartedAt: now, from: new Map() }
      active = enterStep(entry, 0, now, now)
      update(now)
      return true
    },
    update,
    stop() {
      active = null
      held.clear()
    },
    blackout() {
      active = null
      held.clear()
      for (const fixture of lights) {
        current.set(fixture.id, darkState())
      }
    },
    currentSceneId: () => active?.scene.id ?? null,
    states: () => current,
  }
}
