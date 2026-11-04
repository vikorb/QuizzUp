import type { Clock, TimerHandle } from '../clock'
import { browserClock } from '../clock'
import type { LightingConfig } from '../config'
import type { FixtureState, PanTilt } from '../dmx/fixtures'
import { darkState, parseRig, renderUniverse } from '../dmx/fixtures'
import type { DmxDriver, DmxOutput, DmxOutputStatus } from '../dmx/output'
import type { FixtureKind } from '../dmx/profiles'
import { createUniverse, DMX_CHANNELS } from '../dmx/universe'
import { createEmitter } from '../emitter'
import type { Desk, Rgbw, Unsubscribe } from '../types'
import { clampByte, isDesk } from '../types'
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

/** Durée maximale d'un gel volontaire des trames (test de perte de signal). */
/** Trames noires acceptées d'affilée pour sortir de l'état d'erreur (environ 1 s à 30 Hz). */
export const OUTPUT_RECOVERY_WRITES = 30

export const MAX_FREEZE_MS = 15_000

/** Sans action de l'opérateur pendant ce délai, le diagnostic se termine tout seul. */
export const DIAGNOSTICS_IDLE_MS = 10 * 60_000

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
  | { kind: 'output_recovered'; at: number }
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
  /** Mode diagnostic : test canal par canal et appareil par appareil (voir `LightingDiagnostics`). */
  diagnostics: LightingDiagnostics
}

export type DiagnosticRefusal =
  | 'not_active'
  | 'emergency'
  | 'invalid_address'
  | 'smoke_channel'
  | 'unknown_channel'
  | 'unknown_fixture'
  | 'not_confirmed'
  | 'invalid_duration'

export type DiagnosticResult = { ok: true } | { ok: false; reason: DiagnosticRefusal }

export type DiagnosticsState = {
  active: boolean
  allowUnknownChannels: boolean
  /** Fin du gel des trames en cours (test de perte de signal), `null` sinon. */
  frozenUntil: number | null
}

/**
 * Diagnostic matériel. Les scènes sont suspendues et l'opérateur pilote directement :
 * - un canal brut (trouver l'adresse d'un appareil inconnu) ;
 * - un appareil configuré (couleur, intensité, position) ;
 * - la fumée, uniquement par le contrôleur sécurisé : un canal de fumée ne se règle jamais à la main ;
 * - un gel volontaire des trames, pour vérifier que le relais temporisé ou l'interface coupe
 *   la fumée quand la page plante.
 */
export type LightingDiagnostics = {
  /**
   * Entre en diagnostic. Avec `allowUnknownChannels`, les canaux qui n'appartiennent à aucun
   * appareil configuré sont réglables : débrancher la machine à fumée avant, car son adresse
   * réelle est peut-être l'un d'eux.
   */
  begin: (options?: { allowUnknownChannels?: boolean }) => DiagnosticResult
  end: () => void
  /** Adresse 1-512, valeur 0-255. */
  setChannel: (address: number, value: number) => DiagnosticResult
  setFixture: (
    fixtureId: string,
    state: Partial<Pick<FixtureState, 'color' | 'intensity' | 'position' | 'strobe'>>
  ) => DiagnosticResult
  /** Remet tous les canaux de test à zéro. */
  clear: () => void
  /**
   * Gèle l'envoi des trames pendant `durationMs` (≤ 15 s) : l'interface garde la dernière trame,
   * comme si la page avait planté. Exige `confirm: true`. Annulé par l'arrêt d'urgence.
   */
  freezeOutput: (durationMs: number, options: { confirm: boolean }) => DiagnosticResult
  getState: () => DiagnosticsState
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
  let diagnosticsActive = false
  let allowUnknownChannels = false
  let diagnosticsTouchedAt = 0
  let frozenUntil: number | null = null
  let recoveredWrites = 0
  let manualChannels = createUniverse()
  const manualFixtures = new Map<string, FixtureState>()
  const fixtureChannels = new Set<number>()
  const smokeChannels = new Set<number>()
  for (const fixture of fixtures) {
    fixture.profile.channels.forEach((spec, offset) => {
      const address = fixture.address + offset
      fixtureChannels.add(address)
      if (spec.role === 'smoke' || fixture.profile.kind === 'smoke') {
        smokeChannels.add(address)
      }
    })
  }
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
    const write = output.write(universe).then(
      () => {
        if (owner === session && outputStatus === 'error') {
          noteRecoveredWrite()
        }
      },
      (error: unknown) => {
        if (owner !== session) {
          return
        }
        recoveredWrites = 0
        handleOutputError(error)
      }
    )
    const current = within(write, WRITE_TIMEOUT_MS).then((done) => {
      if (!done && owner === session) {
        recoveredWrites = 0
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

  /**
   * Sortie en erreur qui accepte de nouveau les trames (écriture lente passagère, onglet
   * ralenti…) : après `OUTPUT_RECOVERY_WRITES` trames noires acceptées d'affilée, on reprend.
   * La fumée, coupée à l'erreur, n'est pas relancée.
   */
  function noteRecoveredWrite() {
    recoveredWrites += 1
    if (recoveredWrites < OUTPUT_RECOVERY_WRITES) {
      return
    }
    recoveredWrites = 0
    outputStatus = 'open'
    outputError = null
    warn({ kind: 'output_recovered', at: clock.now() })
    notify()
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
      frozenUntil = null
      send(createUniverse())
      return
    }
    if (frozenUntil !== null) {
      if (now < frozenUntil) {
        // Gel volontaire : aucune trame, l'interface répète la dernière reçue.
        return
      }
      frozenUntil = null
      // Fin d'un test de coupure : la fumée doit être réautorisée par un humain.
      smoke.disarm()
      notify()
    }
    if (diagnosticsActive) {
      if (now - diagnosticsTouchedAt > DIAGNOSTICS_IDLE_MS) {
        endDiagnostics()
      } else {
        send(renderDiagnostics(now))
        return
      }
    }
    player.update(now)
    send(renderUniverse(fixtures, player.states(), smoke.level(now)))

    const sceneId = player.currentSceneId()
    if (sceneId !== lastSceneId) {
      lastSceneId = sceneId
      notify()
    }
  }

  /** Trame de diagnostic : canaux bruts, puis appareils réglés, puis fumée sécurisée. */
  function renderDiagnostics(now: number): Uint8Array {
    const universe = manualChannels.slice()
    const overlay = renderUniverse(
      fixtures.filter(
        (fixture) => manualFixtures.has(fixture.id) || fixture.profile.kind === 'smoke'
      ),
      manualFixtures,
      smoke.level(now)
    )
    for (const fixture of fixtures) {
      if (manualFixtures.has(fixture.id) || fixture.profile.kind === 'smoke') {
        fixture.profile.channels.forEach((_spec, offset) => {
          const index = fixture.address - 1 + offset
          universe[index] = overlay[index] ?? 0
        })
      }
    }
    for (const address of smokeChannels) {
      universe[address - 1] = overlay[address - 1] ?? 0
    }
    return universe
  }

  function endDiagnostics() {
    if (!diagnosticsActive) {
      return
    }
    diagnosticsActive = false
    allowUnknownChannels = false
    frozenUntil = null
    manualChannels = createUniverse()
    manualFixtures.clear()
    player.blackout()
    playScene(SCENE_IDS.IDLE)
    notify()
  }

  const touchDiagnostics = (): DiagnosticResult | null => {
    if (emergency) {
      return { ok: false, reason: 'emergency' }
    }
    if (!diagnosticsActive) {
      return { ok: false, reason: 'not_active' }
    }
    diagnosticsTouchedAt = clock.now()
    return null
  }

  const diagnostics: LightingDiagnostics = {
    begin(beginOptions = {}) {
      if (emergency) {
        return { ok: false, reason: 'emergency' }
      }
      diagnosticsActive = true
      allowUnknownChannels = beginOptions.allowUnknownChannels === true
      diagnosticsTouchedAt = clock.now()
      manualChannels = createUniverse()
      manualFixtures.clear()
      player.stop()
      notify()
      return { ok: true }
    },
    end: endDiagnostics,
    setChannel(address, value) {
      const refused = touchDiagnostics()
      if (refused) {
        return refused
      }
      if (!Number.isInteger(address) || address < 1 || address > DMX_CHANNELS) {
        return { ok: false, reason: 'invalid_address' }
      }
      if (smokeChannels.has(address)) {
        return { ok: false, reason: 'smoke_channel' }
      }
      if (!fixtureChannels.has(address) && !allowUnknownChannels) {
        return { ok: false, reason: 'unknown_channel' }
      }
      manualChannels[address - 1] = clampByte(value)
      return { ok: true }
    },
    setFixture(fixtureId, state) {
      const refused = touchDiagnostics()
      if (refused) {
        return refused
      }
      const fixture = fixtures.find((candidate) => candidate.id === fixtureId)
      if (!fixture || fixture.profile.kind === 'smoke') {
        return { ok: false, reason: 'unknown_fixture' }
      }
      const previous = manualFixtures.get(fixtureId) ?? darkState()
      manualFixtures.set(fixtureId, {
        color: state.color ? { ...state.color } : previous.color,
        intensity: state.intensity ?? previous.intensity,
        position: state.position === undefined ? previous.position : state.position,
        strobe: state.strobe ?? previous.strobe,
      })
      return { ok: true }
    },
    clear() {
      manualChannels = createUniverse()
      manualFixtures.clear()
      diagnosticsTouchedAt = clock.now()
    },
    freezeOutput(durationMs, freezeOptions) {
      const refused = touchDiagnostics()
      if (refused) {
        return refused
      }
      if (!freezeOptions.confirm) {
        return { ok: false, reason: 'not_confirmed' }
      }
      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_FREEZE_MS) {
        return { ok: false, reason: 'invalid_duration' }
      }
      // La trame en cours (fumée comprise) part avant le gel : c'est elle que l'interface
      // répétera. Sans cela, le gel figerait l'avant-dernière trame.
      send(renderDiagnostics(clock.now()))
      frozenUntil = clock.now() + durationMs
      // Le chien de garde ne doit pas compter le gel comme un plantage.
      lastFrameAt = null
      notify()
      return { ok: true }
    },
    getState: () => ({ active: diagnosticsActive, allowUnknownChannels, frozenUntil }),
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
      // Une interface figée peut ne jamais rendre la main : on n'attend pas indéfiniment.
      await within(output.close(), CLOSE_TIMEOUT_MS)
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
    // Pendant un diagnostic, aucune scène (ni fumée de scène) ne se déclenche.
    if (emergency || diagnosticsActive) {
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
      if (emergency || diagnosticsActive || !fixtures.some((fixture) => fixture.id === fixtureId)) {
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
        // Couper la fumée pendant un gel doit agir tout de suite : on reprend l'envoi.
        frozenUntil = null
        notify()
      },
      fire(durationMs) {
        const result = fireSmoke(durationMs)
        notify()
        return result
      },
      stop() {
        smoke.stop('manual')
        frozenUntil = null
        notify()
      },
    },
    emergencyStop(reason = 'Arrêt d’urgence') {
      emergency = true
      frozenUntil = null
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
    diagnostics,
  }
}
