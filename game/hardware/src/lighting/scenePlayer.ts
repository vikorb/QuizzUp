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
import { FLASH_RISE_LEVEL, flashPeriodMs, MIN_FLASH_INTERVAL_MS, stepDuration } from './scenes'

export type ScenePlayerOptions = {
  fixtures: readonly ResolvedFixture[]
  deskColors: Record<Desk, Rgb>
  /** Appelé pour une étape `smoke` : le contrôleur décide (sécurité). */
  onSmoke: (durationMs: number) => void
  /** Retrouve la scène désignée par `next` ; absente ou inconnue, la chaîne s'arrête. */
  resolveScene: (sceneId: string) => SceneDefinition | undefined
}

export type ScenePlayer = {
  /**
   * Lance une scène ; refusée (false) si une scène plus prioritaire est en cours. `restore` :
   * restitue seulement l'état lumineux (étapes de couleur et attentes), sans fumée ni éclair, y
   * compris dans les scènes enchaînées par `next` (reprise après une pause).
   */
  play: (
    scene: SceneDefinition,
    context: SceneContext,
    now: number,
    playOptions?: { restore?: boolean }
  ) => boolean
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
  /** Rejeu de reprise : la scène (et celles qu'elle enchaîne) est vidée de ses pas `smoke` et `flash`. */
  restore: boolean
}

/** Scène de reprise : ni jet de fumée ni éclair, seulement l'état lumineux. */
const forRestore = (scene: SceneDefinition): SceneDefinition => ({
  ...scene,
  steps: scene.steps.filter((step) => step.type !== 'smoke' && step.type !== 'flash'),
})

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

  // Sécurité (photosensibilité) : plafond d'éclairs par seconde pour toute la salle, tenu ici pour
  // toute scène (par défaut, réglée par une salle, bouclée ou enchaînée). Tout état écrit sur un
  // appareil passe par `commit`.
  //
  // Éclair : le niveau d'une composante de l'appareil (r, g, b ou w, chacune × intensité, 0 à 1)
  // remonte d'au moins `FLASH_RISE_LEVEL` au-dessus du minimum atteint depuis le dernier éclair
  // compté sur cette composante. Suivre chaque composante (et non la plus forte) fait compter un
  // changement de couleur à même niveau (rouge 255 puis bleu 255 : le rouge tombe, le bleu monte).
  // Une montée continue (fondu) ne compte qu'une fois : le suivi d'une composante repart de zéro dès
  // qu'elle cesse de monter. Dans un fondu, plusieurs composantes franchissent le seuil à des
  // instants différents : celle qui monte depuis avant le dernier éclair compté de l'appareil
  // (`troughAt` < `flashAt`) fait partie du même fondu et ne compte pas en plus, sinon le fondu
  // serait figé. Une composante qui a baissé ou s'est stabilisée depuis (`troughAt` à jour) compte
  // pour elle-même : on ne contourne pas le plafond en faisant clignoter une couleur pendant qu'une
  // autre monte lentement. Un éclair n'est permis que `MIN_FLASH_INTERVAL_MS` après le dernier de
  // la salle, ou dans le même instant (plusieurs appareils qui s'allument ensemble comptent pour un).
  //
  // Un éclair trop proche est retenu : l'appareil garde son niveau et l'état est appliqué dès que le
  // plafond le permet, même si plus aucune scène ne tourne (`held`). Un flash retenu n'est pas gardé :
  // sa fenêtre se rejoue à chaque mise à jour tant qu'elle dure, puis il est perdu.
  type Track = {
    levels: number[]
    troughs: number[]
    troughAt: number[]
    counted: boolean[]
    flashAt: number | null
    at: number
  }
  const freshTrack = (): Track => ({
    levels: [0, 0, 0, 0],
    troughs: [0, 0, 0, 0],
    troughAt: [-Infinity, -Infinity, -Infinity, -Infinity],
    counted: [false, false, false, false],
    flashAt: null,
    at: -Infinity,
  })
  const tracks = new Map<string, Track>(lights.map((fixture) => [fixture.id, freshTrack()]))
  let lastFlashAt: number | null = null
  const held = new Map<string, FixtureState>()

  const levelsOf = ({ intensity, color }: FixtureState) =>
    [color.r, color.g, color.b, color.w ?? 0].map((component) => (intensity * component) / 255)

  const commit = (id: string, next: FixtureState, now: number, transient = false) => {
    const track = tracks.get(id) ?? freshTrack()
    const levels = levelsOf(next)
    // Une composante baisse, ou se stabilise à un autre instant : une nouvelle montée peut commencer.
    levels.forEach((level, index) => {
      if (level < track.levels[index]! || (now > track.at && level === track.levels[index])) {
        track.troughs[index] = level
        track.troughAt[index] = now
        track.counted[index] = false
      }
    })
    const rising = levels.map(
      (level, index) => !track.counted[index] && level - track.troughs[index]! >= FLASH_RISE_LEVEL
    )
    if (rising.includes(true)) {
      const sameFade = (index: number) =>
        track.flashAt !== null && track.troughAt[index]! < track.flashAt
      if (rising.some((isRising, index) => isRising && !sameFade(index))) {
        if (
          lastFlashAt !== null &&
          now !== lastFlashAt &&
          now - lastFlashAt < MIN_FLASH_INTERVAL_MS
        ) {
          if (!transient) {
            held.set(id, next)
          }
          return
        }
        lastFlashAt = now
        track.flashAt = now
      }
      rising.forEach((isRising, index) => {
        track.counted[index] = track.counted[index] || isRising
      })
    }
    track.levels = levels
    track.at = now
    tracks.set(id, track)
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
    // Pupitre sans aucun appareil, ou inconnu (`null`) : repli lisible, toute la salle prend son rôle
    // et « les autres » est vide (sinon le buzz ou la victoire assombrirait toute la salle).
    const noDeskFixture = own.length === 0
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
      const lit = elapsed < stepDuration(step) && elapsed % flashPeriodMs(step) < step.onMs
      commit(
        fixture.id,
        lit
          ? { color: { ...color }, intensity: 1, position, strobe: 0 }
          : { ...cloneState(start), position },
        now,
        lit
      )
    }
  }

  const enterStep = (entry: Active, index: number, at: number, now: number): Active => {
    const next: Active = {
      ...entry,
      stepIndex: index,
      stepStartedAt: at,
      // Une étape part de l'état voulu, pas de celui que le plafond d'éclairs retient encore.
      from: new Map([...current].map(([id, state]) => [id, cloneState(held.get(id) ?? state)])),
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
    // Instant de départ de chaque scène enchaînée pendant ce rattrapage : sert à reconnaître un tour
    // complet de boucle.
    const startedAt = new Map<string, number>()
    for (let guard = 0; guard < maxSteps; guard += 1) {
      const step = entry.scene.steps[entry.stepIndex]
      if (!step) {
        const next =
          entry.scene.next === undefined ? undefined : options.resolveScene(entry.scene.next)
        if (!next) {
          active = null
          return
        }
        // Enchaînement : la scène suivante part à l'instant exact où celle-ci s'est terminée. Après un
        // gel de la page, ses étapes passées sont rattrapées sans fumée en retard (voir `enterStep`).
        let at = entry.stepStartedAt
        const previous = startedAt.get(next.id)
        if (previous !== undefined && at > previous) {
          // Un tour de boucle vient d'être rejoué : on saute les tours complets restants (le garde-fou
          // ne suffirait pas après un long gel) et on rejoue seulement le dernier, partiel.
          const lap = at - previous
          at += Math.floor((now - at) / lap) * lap
        }
        startedAt.set(next.id, at)
        entry = enterStep({ ...entry, scene: entry.restore ? forRestore(next) : next }, 0, at, now)
        active = entry
        continue
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
    // Un appareil que rien n'a écrit à cet instant est stable : sa montée précédente est finie, la
    // suivante comptera de nouveau (un palier à 0,55 après un extrait n'efface pas le prochain éclair).
    for (const track of tracks.values()) {
      if (track.at < now) {
        track.troughs = [...track.levels]
        track.troughAt = track.troughAt.map(() => now)
        track.counted = [false, false, false, false]
      }
    }
  }

  return {
    play(scene, context, now, playOptions) {
      if (active && scene.priority < active.scene.priority) {
        return false
      }
      const restore = playOptions?.restore === true
      // `held` reste : `commit` l'efface appareil par appareil quand la nouvelle scène les vise.
      const entry: Active = {
        scene: restore ? forRestore(scene) : scene,
        context,
        stepIndex: 0,
        stepStartedAt: now,
        from: new Map(),
        restore,
      }
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
        tracks.set(fixture.id, freshTrack())
      }
    },
    currentSceneId: () => active?.scene.id ?? null,
    states: () => current,
  }
}
