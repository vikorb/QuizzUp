import type { Clock, TimerHandle } from '../clock'
import { browserClock } from '../clock'
import type { LightingConfig } from '../config'
import type { FixtureState, PanTilt } from '../dmx/fixtures'
import { parseRig, renderUniverse } from '../dmx/fixtures'
import type { DmxDriver, DmxOutput, DmxOutputStatus } from '../dmx/output'
import type { FixtureKind } from '../dmx/profiles'
import { createUniverse } from '../dmx/universe'
import { createEmitter } from '../emitter'
import type { Desk, Rgbw, Unsubscribe } from '../types'
import { isDesk } from '../types'
import type { ScenePlayer } from './scenePlayer'
import { createScenePlayer } from './scenePlayer'
import type { SceneContext, SceneDefinition } from './scenes'
import { DEFAULT_BINDINGS, DEFAULT_SCENES, identifyScene, SCENE_IDS } from './scenes'
import type { SmokeController, SmokeFireResult, SmokeState } from './smoke'
import { createSmokeController } from './smoke'

/** Délai sans trame au-delà duquel on considère que la page a gelé : la fumée est coupée. */
export const WATCHDOG_STALL_MS = 500

/** Attente maximale de la dernière trame noire à la fermeture de la sortie. */
const CLOSE_TIMEOUT_MS = 250

/** Une écriture DMX plus longue que ce délai signifie une interface bloquée. */
export const WRITE_TIMEOUT_MS = 500

const REFRESH_LIMITS = { min: 10, max: 40, fallback: 30 } as const

/**
 * Événement de jeu, au format du moteur (`{ type, payload }` de `@quizzup/game-engine`).
 * Typé de façon structurelle pour ne pas dépendre du moteur.
 */
export type HardwareGameEvent = { type: string; payload?: Record<string, unknown> }

/** Retrouve le pupitre d'un participant (le moteur raisonne en `participantId`). */
export type DeskResolver = (participantId: number) => Desk | null

export type LightingWarning =
  | { kind: 'smoke_refused'; reason: Exclude<SmokeFireResult, { ok: true }>['reason']; at: number }
  | { kind: 'watchdog'; stalledMs: number; at: number }
  | { kind: 'output_error'; message: string; at: number }
  | { kind: 'page_hidden'; at: number }
  | { kind: 'unknown_scene'; sceneId: string; at: number }

export type FixtureView = {
  id: string
  name: string
  kind: FixtureKind
  desk: Desk | null
  color: Rgbw
  intensity: number
  position: PanTilt | null
}

export type LightingState = {
  running: boolean
  driver: DmxDriver
  simulation: boolean
  outputStatus: DmxOutputStatus
  outputError: string | null
  emergency: boolean
  emergencyReason: string | null
  currentSceneId: string | null
  smoke: SmokeState
  problems: string[]
  lastWarning: LightingWarning | null
}

export type LightingController = {
  start: () => Promise<void>
  stop: () => Promise<void>
  /** Remplace la sortie (ex. simulation → interface USB après « Connecter l'interface »). */
  setOutput: (output: DmxOutput) => Promise<void>
  handleGameEvent: (event: HardwareGameEvent) => void
  playScene: (sceneId: string, context?: SceneContext) => boolean
  identifyFixture: (fixtureId: string) => boolean
  smoke: {
    arm: () => boolean
    disarm: () => void
    /** Test manuel depuis l'écran de configuration ; mêmes sécurités qu'en jeu. */
    fire: (durationMs: number) => SmokeFireResult
    stop: () => void
  }
  /** Arrêt d'urgence logiciel : noir complet, fumée coupée et verrouillée jusqu'au réarmement. */
  emergencyStop: (reason?: string) => void
  resetEmergency: () => void
  getState: () => LightingState
  onChange: (listener: (state: LightingState) => void) => Unsubscribe
  onWarning: (listener: (warning: LightingWarning) => void) => Unsubscribe
  /** État des appareils pour la vue « simulation » de l'écran de salle. */
  getFixtureViews: () => FixtureView[]
  /** Dernière trame envoyée (copie). */
  getFrame: () => Uint8Array
}

export type LightingControllerOptions = {
  config: LightingConfig
  output: DmxOutput
  clock?: Clock
  /** Document surveillé (onglet masqué, fermeture) ; `null` pour désactiver. */
  doc?: Document | null
  resolveDesk?: DeskResolver
  /** Scènes en plus ou à la place des scènes par défaut (même identifiant = remplacement). */
  scenes?: readonly SceneDefinition[]
}

const participantDesk = (value: unknown, resolveDesk: DeskResolver | undefined): Desk | null =>
  typeof value === 'number' && resolveDesk ? resolveDesk(value) : null

/**
 * Pilote lumières et fumée : boucle d'envoi des trames DMX, scènes déclenchées par les
 * événements du moteur, chien de garde, arrêt d'urgence.
 */
export function createLightingController(options: LightingControllerOptions): LightingController {
  const { config } = options
  const clock = options.clock ?? browserClock
  const doc = options.doc === undefined ? (globalThis.document ?? null) : options.doc
  const rig = parseRig(config.fixtures, config.customProfiles)
  const refreshHz = Number.isFinite(config.refreshHz)
    ? Math.min(REFRESH_LIMITS.max, Math.max(REFRESH_LIMITS.min, config.refreshHz))
    : REFRESH_LIMITS.fallback
  const intervalMs = Math.round(1000 / refreshHz)
  const fixtures = rig.fixtures

  const scenes = new Map<string, SceneDefinition>()
  for (const scene of [...DEFAULT_SCENES, ...(options.scenes ?? [])]) {
    scenes.set(scene.id, scene)
  }
  const bindings: Record<string, string | null> = { ...DEFAULT_BINDINGS, ...config.bindings }

  const changeEmitter = createEmitter<LightingState>()
  const warningEmitter = createEmitter<LightingWarning>()

  const smoke: SmokeController = createSmokeController({ config: config.smoke, clock })
  const player: ScenePlayer = createScenePlayer({
    fixtures,
    deskColors: config.deskColors,
    onSmoke: (durationMs) => {
      const result = fireSmoke(durationMs)
      if (!result.ok) {
        warn({ kind: 'smoke_refused', reason: result.reason, at: clock.now() })
      }
    },
  })

  let output = options.output
  let outputStatus: DmxOutputStatus = 'closed'
  let outputError: string | null = null
  let detachOutput: Unsubscribe | null = null
  let timer: TimerHandle | null = null
  let running = false
  let inFlight: Promise<void> | null = null
  let pending = false
  /** Numéro de session de sortie : une écriture d'une session close n'affecte pas la suivante. */
  let session = 0
  let emergency = false
  let emergencyReason: string | null = null
  let lastFrameAt: number | null = null
  let lastWarning: LightingWarning | null = null
  let lastSceneId: string | null = null
  let frame = createUniverse()

  const getState = (): LightingState => ({
    running,
    driver: output.driver,
    simulation: output.driver === 'simulation',
    outputStatus,
    outputError,
    emergency,
    emergencyReason,
    currentSceneId: player.currentSceneId(),
    smoke: smoke.getState(),
    problems: [...rig.problems],
    lastWarning,
  })

  const notify = () => changeEmitter.emit(getState())

  function warn(warning: LightingWarning) {
    lastWarning = warning
    warningEmitter.emit(warning)
    notify()
  }

  /**
   * Envoie la trame la plus récente. Si une écriture est encore en cours, la nouvelle trame
   * remplace la précédente en attente (pas d'empilement de retard) et part dès que possible :
   * une trame d'arrêt d'urgence n'est donc jamais perdue.
   */
  const send = (universe: Uint8Array) => {
    frame = universe
    pending = true
    flush()
  }

  /** Résout `true` si la promesse aboutit avant le délai, `false` sinon. */
  const within = (promise: Promise<unknown>, ms: number) =>
    new Promise<boolean>((resolve) => {
      const handle = clock.setTimeout(() => resolve(false), ms)
      promise.then(
        () => {
          clock.clearTimeout(handle)
          resolve(true)
        },
        () => {
          clock.clearTimeout(handle)
          resolve(true)
        }
      )
    })

  function flush() {
    const degraded = outputStatus === 'error'
    if ((outputStatus !== 'open' && !degraded) || inFlight || !pending) {
      return
    }
    pending = false
    const owner = session
    // Sortie en erreur : on continue d'essayer d'envoyer du noir, au cas où elle répond encore.
    const universe = degraded ? createUniverse() : frame
    const write = output.write(universe).catch((error: unknown) => {
      if (owner === session) {
        handleOutputError(error)
      }
    })
    const current = within(write, WRITE_TIMEOUT_MS).then((done) => {
      if (!done && owner === session) {
        handleOutputError(new Error('Interface DMX bloquée : aucune trame acceptée'))
      }
    })
    inFlight = current
    void current.finally(() => {
      if (inFlight === current) {
        inFlight = null
      }
      flush()
    })
  }

  function handleOutputError(error: unknown) {
    if (outputStatus === 'error' || outputStatus === 'closing' || outputStatus === 'closed') {
      return
    }
    smoke.stop('output_error')
    outputStatus = 'error'
    outputError = error instanceof Error ? error.message : String(error)
    // Une trame noire part dès que l'interface accepte de nouveau une écriture.
    send(createUniverse())
    warn({ kind: 'output_error', message: outputError, at: clock.now() })
  }

  const tick = () => {
    const now = clock.now()
    if (lastFrameAt !== null && now - lastFrameAt > WATCHDOG_STALL_MS) {
      const firing = smoke.getState(now).status === 'firing'
      smoke.stop('watchdog')
      if (firing) {
        warn({ kind: 'watchdog', stalledMs: now - lastFrameAt, at: now })
      }
    }
    lastFrameAt = now

    if (emergency || outputStatus === 'error') {
      send(createUniverse())
      return
    }
    player.update(now)
    send(renderUniverse(fixtures, player.states(), smoke.level(now)))

    const sceneId = player.currentSceneId()
    if (sceneId !== lastSceneId) {
      lastSceneId = sceneId
      notify()
    }
  }

  const openOutput = async () => {
    session += 1
    outputStatus = 'opening'
    outputError = null
    notify()
    try {
      await output.open()
      outputStatus = 'open'
      detachOutput = output.onDisconnect((error) => handleOutputError(error))
    } catch (error) {
      outputStatus = 'error'
      outputError = error instanceof Error ? error.message : String(error)
    }
    notify()
  }

  /**
   * Ferme la sortie courante : plus aucune trame de jeu n'est acceptée (`closing`), on attend
   * l'écriture en cours puis on envoie une trame noire **en dernier**, sans attendre plus que
   * prévu une interface bloquée.
   */
  const closeOutput = async () => {
    detachOutput?.()
    detachOutput = null
    const wasOpen = outputStatus === 'open' || outputStatus === 'error'
    outputStatus = 'closing'
    pending = false
    const black = createUniverse()
    frame = black
    if (wasOpen) {
      if (inFlight) {
        await within(inFlight, CLOSE_TIMEOUT_MS)
      }
      await within(output.write(black), CLOSE_TIMEOUT_MS)
    }
    try {
      await output.close()
    } catch {
      // Sortie déjà fermée ou débranchée.
    }
    inFlight = null
    session += 1
    outputStatus = 'closed'
  }

  const startLoop = () => {
    if (timer === null) {
      lastFrameAt = null
      timer = clock.setInterval(tick, intervalMs)
    }
  }

  const stopLoop = () => {
    if (timer !== null) {
      clock.clearInterval(timer)
      timer = null
    }
  }

  const isHidden = () => doc?.visibilityState === 'hidden'

  const fireSmoke = (durationMs: number): SmokeFireResult => {
    if (isHidden()) {
      // Onglet en arrière-plan : les minuteurs sont bridés, la trame d'arrêt pourrait tarder.
      return { ok: false, reason: 'page_hidden' }
    }
    return smoke.fire(durationMs)
  }

  const onVisibilityChange = () => {
    if (doc?.visibilityState === 'hidden') {
      // Onglet masqué : le navigateur ralentit les minuteurs, on ne garde pas de fumée active.
      smoke.stop('page_hidden')
      if (timer !== null) {
        tick()
      }
      warn({ kind: 'page_hidden', at: clock.now() })
    }
  }

  const onPageHide = () => {
    smoke.stop('shutdown')
    if (outputStatus === 'open') {
      void output.write(createUniverse()).catch(() => undefined)
    }
  }

  const playScene = (sceneId: string, context: SceneContext = { desk: null }) => {
    if (emergency) {
      return false
    }
    const scene = scenes.get(sceneId)
    if (!scene) {
      warn({ kind: 'unknown_scene', sceneId, at: clock.now() })
      return false
    }
    const played = player.play(scene, context, clock.now())
    if (played) {
      lastSceneId = scene.id
      notify()
    }
    return played
  }

  const resolveEvent = (event: HardwareGameEvent): { key: string; desk: Desk | null } => {
    const payload = event.payload ?? {}
    const explicitDesk = isDesk(payload.desk) ? payload.desk : null

    if (event.type === 'question_ended') {
      const winners = Array.isArray(payload.winnerIds) ? payload.winnerIds : []
      // Personne n'a trouvé : « perdu pour tout le monde ».
      return { key: winners.length === 0 ? 'question_lost' : 'question_won', desk: explicitDesk }
    }
    if (event.type === 'game_ended') {
      if (payload.reason !== undefined && payload.reason !== 'completed') {
        // Partie terminée faute de contenu : pas de célébration (ni fumée).
        return { key: 'game_ended_incomplete', desk: null }
      }
      const winners = Array.isArray(payload.winnerIds) ? payload.winnerIds : []
      const desk =
        explicitDesk ??
        (winners.length === 1 ? participantDesk(winners[0], options.resolveDesk) : null)
      return { key: event.type, desk }
    }
    return {
      key: event.type,
      desk: explicitDesk ?? participantDesk(payload.participantId, options.resolveDesk),
    }
  }

  /**
   * `start`, `stop` et `setOutput` s'exécutent l'un après l'autre : un `stop()` pendant une
   * ouverture lente attend la fin de celle-ci puis referme proprement (pas de boucle fantôme,
   * pas de port laissé ouvert).
   */
  let lifecycle: Promise<void> = Promise.resolve()
  const serialize = (operation: () => Promise<void>): Promise<void> => {
    const run = lifecycle.then(operation)
    lifecycle = run.catch(() => undefined)
    return run
  }

  return {
    start: () =>
      serialize(async () => {
        if (running) {
          return
        }
        running = true
        await openOutput()
        doc?.addEventListener('visibilitychange', onVisibilityChange)
        globalThis.addEventListener?.('pagehide', onPageHide)
        startLoop()
        playScene(SCENE_IDS.IDLE)
        tick()
      }),
    stop: () =>
      serialize(async () => {
        if (!running) {
          return
        }
        running = false
        stopLoop()
        doc?.removeEventListener('visibilitychange', onVisibilityChange)
        globalThis.removeEventListener?.('pagehide', onPageHide)
        smoke.stop('shutdown')
        player.blackout()
        await closeOutput()
        notify()
      }),
    setOutput: (next) =>
      serialize(async () => {
        smoke.stop('output_error')
        stopLoop()
        await closeOutput()
        output = next
        if (running) {
          await openOutput()
          startLoop()
          tick()
        } else {
          notify()
        }
      }),
    handleGameEvent(event) {
      const { key, desk } = resolveEvent(event)
      const sceneId = Object.hasOwn(bindings, key) ? bindings[key] : undefined
      if (sceneId) {
        playScene(sceneId, { desk })
      }
    },
    playScene,
    identifyFixture(fixtureId) {
      if (emergency || !fixtures.some((fixture) => fixture.id === fixtureId)) {
        return false
      }
      const played = player.play(identifyScene(fixtureId), { desk: null }, clock.now())
      notify()
      return played
    },
    smoke: {
      arm() {
        const armed = smoke.arm()
        notify()
        return armed
      },
      disarm() {
        smoke.disarm()
        notify()
      },
      fire(durationMs) {
        const result = fireSmoke(durationMs)
        notify()
        return result
      },
      stop() {
        smoke.stop('manual')
        notify()
      },
    },
    emergencyStop(reason = 'Arrêt d’urgence') {
      emergency = true
      emergencyReason = reason
      smoke.emergencyStop()
      player.blackout()
      send(createUniverse())
      notify()
    },
    resetEmergency() {
      if (!emergency) {
        return
      }
      emergency = false
      emergencyReason = null
      smoke.resetEmergency()
      playScene(SCENE_IDS.IDLE)
      notify()
    },
    getState,
    onChange: changeEmitter.on,
    onWarning: warningEmitter.on,
    getFixtureViews: () =>
      fixtures.map((fixture) => {
        const state: FixtureState | undefined = player.states().get(fixture.id)
        return {
          id: fixture.id,
          name: fixture.name,
          kind: fixture.profile.kind,
          desk: fixture.desk ?? null,
          color: state ? { ...state.color } : { r: 0, g: 0, b: 0, w: 0 },
          intensity: state?.intensity ?? 0,
          position: state?.position ?? null,
        }
      }),
    getFrame: () => frame.slice(),
  }
}
