import type { GameEvent, GameState } from '@quizzup/game-engine'
import {
  activeKeymap,
  activeLightingConfig,
  type ArtnetNode,
  type BridgeArtnetStatus,
  type BridgeOutput,
  BridgePollError,
  type BuzzerInput,
  type BuzzerInputState,
  type BuzzerKeymap,
  type BuzzerLayout,
  type BuzzerPress,
  type BuzzerSource,
  createBridgeOutput,
  createGamepadBuzzerInput,
  createKeyboardBuzzerInput,
  createLightingController,
  createMeteredOutput,
  createSerialOutput,
  createSimulationOutput,
  DEFAULT_BRIDGE_URL,
  defaultRoomHardwareConfig,
  desksForCount,
  type DmxDriver,
  type DmxOutput,
  findDmxPortByUsb,
  type GamepadBuzzerInput,
  gamepadMatcher,
  getGrantedDmxPort,
  isDesk,
  isWebSerialSupported,
  type KeyboardBuzzerInput,
  type LightingConfig,
  type LightingController,
  type LightingState,
  type MeteredOutput,
  type OutputStats,
  type ParsedRoomHardwareConfig,
  parseRig,
  parseRoomHardwareConfig,
  type PlanPoint,
  type PlanTarget,
  portUsbId,
  type RawKeyPress,
  requestDmxPort,
  type RoomHardwareConfig,
  type SerialPortLike,
  watchDmxPortReconnection,
  withArtnetTarget,
  withBuzzerLayout,
  withDesksCount,
  withLearnedKeymap,
  withoutUnknownKeys,
  withPlanPoint,
} from '@quizzup/hardware'
import { MINI_GAME_FLASH_BLIND_TEST, ROOM_LOG_LEVEL_WARN } from '@quizzup/shared'
import { computed, shallowRef, watch } from 'vue'

import { reportRoomError } from '@/diagnostics/errorReporter'
import { onGameEvents, useRoomGame } from '@/game/useRoomGame'
import { createSimulationKeymap } from '@/hardware/buzzers'
import { RoomApiError } from '@/utils/roomApi'

/**
 * Matériel de la salle, partagé par tous les écrans : config (`rooms.config`), une
 * seule entrée buzzers et un seul contrôleur de lumières pour toute la page.
 *
 * La config vit sur le compte de la salle (`rooms.config`) ; le navigateur du PC
 * de la salle en garde une copie de secours, avec la salle à laquelle elle se
 * rapporte et l'indication qu'elle attend encore d'être envoyée.
 */
export const HARDWARE_STORAGE_KEY = 'quizzup_room_hardware'
export const HARDWARE_SYNC_STORAGE_KEY = 'quizzup_room_hardware_sync'
/**
 * Arrêt d'urgence retenu sur ce PC (valeur = motif). Posé à l'arrêt, effacé seulement par le
 * réarmement humain : après un plantage ou un rechargement, les lumières repartent éteintes.
 */
export const EMERGENCY_STORAGE_KEY = 'quizzup_room_emergency'
/**
 * Preuve d'un test de coupure de la fumée réussi sur ce PC : salle, et empreinte des réglages de
 * fumée testés. Jamais envoyée au compte de la salle, jamais lue dans `rooms.config`.
 */
export const SMOKE_PROOF_STORAGE_KEY = 'quizzup_room_smoke_cutoff'

type HardwareStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

let storage: HardwareStorage | null = null

function getStorage(): HardwareStorage | null {
  if (storage) {
    return storage
  }
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function loadStoredConfig(): unknown {
  try {
    const raw = getStorage()?.getItem(HARDWARE_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as unknown) : {}
  } catch {
    return {}
  }
}

const parsed = shallowRef<ParsedRoomHardwareConfig>(parseRoomHardwareConfig(loadStoredConfig()))

function readStoredEmergency(): string | null {
  try {
    const reason = getStorage()?.getItem(EMERGENCY_STORAGE_KEY)
    return reason === null || reason === undefined ? null : reason || 'operator'
  } catch {
    return null
  }
}

function writeStoredEmergency(reason: string | null): void {
  try {
    if (reason === null) {
      getStorage()?.removeItem(EMERGENCY_STORAGE_KEY)
    } else {
      getStorage()?.setItem(EMERGENCY_STORAGE_KEY, reason)
    }
  } catch {
    // Stockage indisponible : l'arrêt d'urgence vaut jusqu'au rechargement.
  }
}

/**
 * Buzzers des pupitres de la salle (la réserve des pupitres retirés est ignorée). Aucun buzzer
 * associé : on joue avec le clavier de simulation.
 */
function effectiveKeymap(config: RoomHardwareConfig): BuzzerKeymap {
  const active = activeKeymap(config)
  return Object.keys(active).length > 0 ? active : createSimulationKeymap(config.desksCount)
}

// ── Buzzers ────────────────────────────────────────────────────────────────

let buzzerInput: BuzzerInput | null = null
let stopBuzzerState: (() => void) | null = null
const buzzerState = shallowRef<BuzzerInputState | null>(null)

function watchBuzzers(input: BuzzerInput): void {
  stopBuzzerState?.()
  buzzerState.value = input.getState()
  stopBuzzerState = input.onChange((state) => {
    buzzerState.value = state
  })
}

/**
 * Lecteur réel des buzzers : clavier (ou boîtier qui tape des touches), ou carte
 * d'entrées USB vue comme une manette (`buzzers.source.kind === 'gamepad'`).
 */
type BuzzerDevice = KeyboardBuzzerInput | GamepadBuzzerInput

/**
 * Nombre de cartes manettes identiques qui correspondent au choix (0 : aucune ambiguïté). Aucune
 * n'est lue tant que l'opérateur n'en a pas débranché une (l'API Gamepad ne les distingue pas).
 */
const buzzerCardAmbiguous = shallowRef(0)

function syncCardAmbiguity(input: BuzzerDevice | null): void {
  buzzerCardAmbiguous.value =
    input && 'getAmbiguousGamepads' in input ? input.getAmbiguousGamepads().length : 0
}

let device: BuzzerDevice | null = null
let deviceKey = ''
let detachDevice: (() => void) | null = null
const pressListeners = new Set<(press: BuzzerPress) => void>()
const keyListeners = new Set<(key: RawKeyPress) => void>()
const changeListeners = new Set<(state: BuzzerInputState) => void>()

function buzzerSourceKey(config: RoomHardwareConfig): string {
  const source = config.buzzers.source
  return source?.kind === 'gamepad'
    ? `gamepad:${source.match ?? ''}:${source.id ?? ''}`
    : 'keyboard'
}

function emitTo<T>(listeners: Set<(value: T) => void>, value: T): void {
  for (const listener of [...listeners]) {
    listener(value)
  }
}

function releaseDevice(): void {
  detachDevice?.()
  detachDevice = null
  device?.dispose()
  device = null
  deviceKey = ''
  syncCardAmbiguity(null)
}

/** (Re)crée le lecteur pour la source de la config ; les abonnés de la page sont gardés. */
function attachDevice(config: RoomHardwareConfig): BuzzerDevice {
  // Changer de source en pleine séance (écran Matériel) ne doit pas relâcher le verrou clavier.
  const wasLocked = device?.getState().keyboardLocked ?? false
  releaseDevice()
  const keymap = effectiveKeymap(config)
  const source = config.buzzers.source
  const next: BuzzerDevice =
    source?.kind === 'gamepad'
      ? createGamepadBuzzerInput({ keymap, match: gamepadMatcher(source) })
      : createKeyboardBuzzerInput({ keymap })
  const offs = [
    next.onPress((press) => emitTo(pressListeners, press)),
    next.onKey((key) => emitTo(keyListeners, key)),
    next.onChange((state) => {
      syncCardAmbiguity(next)
      emitTo(changeListeners, state)
    }),
  ]
  detachDevice = () => {
    for (const off of offs) {
      off()
    }
  }
  device = next
  deviceKey = buzzerSourceKey(config)
  syncCardAmbiguity(next)
  emitTo(changeListeners, next.getState())
  if (wasLocked) {
    void next.lockSystemKeys()
  }
  return next
}

function subscribe<T>(listeners: Set<(value: T) => void>, listener: (value: T) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Entrée buzzers stable de la page : elle suit le lecteur choisi dans la config. */
const roomBuzzers: BuzzerInput = {
  onPress: (listener) => subscribe(pressListeners, listener),
  onKey: (listener) => subscribe(keyListeners, listener),
  onChange: (listener) => subscribe(changeListeners, listener),
  getState: () => (device ?? attachDevice(parsed.value.config)).getState(),
  dispose: () => {
    releaseDevice()
    pressListeners.clear()
    keyListeners.clear()
    changeListeners.clear()
  },
}

/** Entrée buzzers de la page (clavier ou carte manette, avec le mapping appris de la salle). */
export function getBuzzerInput(): BuzzerInput {
  if (!buzzerInput) {
    attachDevice(parsed.value.config)
    buzzerInput = roomBuzzers
    watchBuzzers(buzzerInput)
  }
  return buzzerInput
}

/** Remplace l'entrée buzzers (tests, buzzers simulés, future passerelle ESP32). */
export function setBuzzerInput(input: BuzzerInput | null): void {
  stopBuzzerState?.()
  stopBuzzerState = null
  if (buzzerInput && buzzerInput !== input) {
    buzzerInput.dispose()
  }
  buzzerInput = input
  buzzerState.value = null
  if (input) {
    watchBuzzers(input)
  }
}

/** Nouvelle config : même lecteur avec le nouveau mapping, ou nouveau lecteur si la source change. */
function applyBuzzerConfig(config: RoomHardwareConfig): void {
  if (buzzerInput !== roomBuzzers || !device) {
    return
  }
  if (buzzerSourceKey(config) === deviceKey) {
    device.setKeymap(effectiveKeymap(config))
  } else {
    attachDevice(config)
  }
}

/**
 * Capte Échap, Alt+Tab… en plein écran (Chrome / Edge), pour ne pas sortir du jeu. Vaut pour les
 * deux sources de buzzers (clavier ou carte manette).
 */
export async function lockBuzzerSystemKeys(): Promise<boolean> {
  getBuzzerInput()
  return device ? device.lockSystemKeys() : false
}

// ── Lumières ───────────────────────────────────────────────────────────────

let lighting: LightingController | null = null
let stopLightingState: (() => void) | null = null
let stopLightingEvents: (() => void) | null = null
/** L'opérateur a choisi la simulation : pas de reconnexion automatique de l'interface. */
let preferSimulation = false
/** Arrêt d'urgence pressé pendant un redémarrage (aucun contrôleur actif) : appliqué au suivant. */
let pendingEmergency: string | null = null
/** Contrôleur en cours de fermeture : il reçoit aussi un arrêt d'urgence. */
let closingLighting: LightingController | null = null
const lightingState = shallowRef<LightingState | null>(null)
const lightingRef = shallowRef<LightingController | null>(null)

/**
 * Démarrages et arrêts passent l'un après l'autre : on ne crée jamais un second
 * contrôleur (qui rouvrirait le port DMX) tant que le précédent n'est pas fermé.
 */
let lightingQueue: Promise<unknown> = Promise.resolve()

function serializeLighting<T>(task: () => Promise<T>): Promise<T> {
  const run = lightingQueue.then(task, task)
  lightingQueue = run.catch(() => undefined)
  return run
}

/** Le moteur numérote les participants comme les pupitres (cf. `toEngineParticipants`). */
function resolveDesk(participantId: number) {
  return isDesk(participantId) ? participantId : null
}

/** Sortie USB réellement branchée, mesurée pour l'écran de diagnostic. */
let meteredOutput: MeteredOutput | null = null
let dmxPort: SerialPortLike | null = null
/**
 * Pourquoi l'interface retenue (`lighting.usb`) n'a pas été reprise : `ambiguous` (deux ports du même
 * modèle, aucun n'est pris : en débrancher un) ou `smoke_board` (le modèle retenu est celui de la
 * carte de la fumée, jamais ouverte en DMX). `null` sinon.
 */
const dmxPortProblem = shallowRef<'ambiguous' | 'smoke_board' | null>(null)
let stopReconnectWatch: (() => void) | null = null
/** Délai entre deux essais automatiques du pont Art-Net tant qu'il est injoignable. */
export const BRIDGE_RETRY_MS = 10_000
let bridgeRetryTimer: ReturnType<typeof setTimeout> | null = null
/** Dernier échec de connexion au pont (absent, occupé…) ; `null` si connecté ou jamais essayé. */
const bridgeError = shallowRef<string | null>(null)

/** Cible Art-Net effective annoncée par le pont à la connexion (et d'où elle vient) ; `null` si non connecté. */
const bridgeArtnet = shallowRef<BridgeArtnetStatus | null>(null)

/** Sortie pont connectée en ce moment (sert à chercher les nœuds Art-Net) ; `null` si non connecté. */
const activeBridge = shallowRef<BridgeOutput | null>(null)

/**
 * Cherche les nœuds Art-Net du réseau local par le pont déjà connecté (le pont n'accepte qu'un seul
 * écran : on réutilise sa connexion). Rejette si le pont n'est pas connecté ou trop ancien.
 */
export function pollArtnetNodes(): Promise<ArtnetNode[]> {
  const bridge = activeBridge.value
  return bridge
    ? bridge.poll()
    : Promise.reject(new BridgePollError('not_connected', 'Pont Art-Net non connecté'))
}

function clearBridgeRetry(): void {
  if (bridgeRetryTimer !== null) {
    clearTimeout(bridgeRetryTimer)
    bridgeRetryTimer = null
  }
}

async function useBridge(controller: LightingController): Promise<void> {
  clearBridgeRetry()
  const { bridgeUrl, artnet } = parsed.value.config.lighting
  // La cible de la salle part dans le hello, à chaque (re)connexion au pont.
  const bridge = createBridgeOutput({ url: bridgeUrl ?? DEFAULT_BRIDGE_URL, artnet })
  const output = createMeteredOutput(bridge)
  meteredOutput = output
  dmxPort = null
  await controller.setOutput(output)
  const { outputStatus, outputError } = controller.getState()
  // Signalé au changement d'état seulement : un pont absent est réessayé toutes les 10 s.
  const wasFailing = bridgeError.value !== null
  bridgeError.value = outputStatus === 'open' ? null : (outputError ?? 'bridge_unavailable')
  if (bridgeError.value !== null && !wasFailing) {
    reportRoomError('artnet_bridge_unavailable', bridgeError.value, {
      level: ROOM_LOG_LEVEL_WARN,
      context: { driver: 'artnet-bridge' },
    })
  }
  bridgeArtnet.value = outputStatus === 'open' ? bridge.artnetStatus() : null
  activeBridge.value = outputStatus === 'open' ? bridge : null
}

/**
 * Reprise du pont sans clic (démarrage, redémarrage des lumières). Pont absent ou occupé : retour
 * à la salle simulée (fumée coupée) et nouvel essai plus tard. Ne bloque jamais plus longtemps
 * que le délai de connexion du pont, et ne lève jamais.
 */
async function autoConnectBridge(controller: LightingController): Promise<void> {
  await useBridge(controller)
  if (bridgeError.value === null) {
    return
  }
  meteredOutput = null
  await controller.setOutput(createSimulationOutput())
  bridgeRetryTimer = setTimeout(() => {
    bridgeRetryTimer = null
    void serializeLighting(async () => {
      // Lumières relancées ou arrêtées, simulation choisie, autre pilote : plus d'essai.
      if (
        controller === lighting &&
        !preferSimulation &&
        parsed.value.config.lighting.driver === 'artnet-bridge'
      ) {
        await autoConnectBridge(controller)
      }
    }).catch(() => undefined)
  }, BRIDGE_RETRY_MS)
}

async function useSerialPort(
  controller: LightingController,
  port: SerialPortLike,
  driver: 'usbpro' | 'opendmx'
): Promise<void> {
  const output = createMeteredOutput(createSerialOutput({ port, driver }))
  meteredOutput = output
  dmxPort = port
  await controller.setOutput(output)
  const { outputStatus, outputError } = controller.getState()
  if (outputStatus === 'error') {
    reportRoomError('dmx_output_error', outputError ?? 'dmx_output_error', {
      context: { driver },
    })
  }
}

/** Mesures de la sortie USB en cours (`null` en simulation). */
export function getDmxStats(): OutputStats | null {
  const state = lighting?.getState()
  return meteredOutput && state && !state.simulation ? meteredOutput.getStats() : null
}

/** Port USB utilisé par les lumières, pour l'afficher (« FTDI 0403:6001 »). */
export function getDmxPort(): SerialPortLike | null {
  return lighting?.getState().simulation === false ? dmxPort : null
}

async function reconnectGrantedPort(controller: LightingController): Promise<void> {
  const { driver } = parsed.value.config.lighting
  if (driver === 'simulation' || preferSimulation) {
    return
  }
  // Le pont est repris sans clic. Absent : bandeau « Connecter le pont » + essais espacés.
  if (driver === 'artnet-bridge') {
    if (controller === lighting) {
      await autoConnectBridge(controller)
    }
    return
  }
  if (!isWebSerialSupported()) {
    return
  }
  // On reprend la même interface (jamais un autre appareil USB autorisé, Arduino…).
  const config = parsed.value.config
  const { usb } = config.lighting
  let port: SerialPortLike | null
  if (usb && !dmxPort) {
    // Après un rechargement : le modèle retenu dans la config, jamais un autre. Deux ports du même
    // modèle ne sont pas départagés : aucun n'est ouvert, le problème est signalé.
    const choice = await findDmxPortByUsb(undefined, usb, {
      exclude: { usb: config.lighting.smoke.board },
    }).catch(() => null)
    dmxPortProblem.value =
      choice?.status === 'ambiguous'
        ? 'ambiguous'
        : choice?.status === 'excluded'
          ? 'smoke_board'
          : null
    port = choice?.status === 'found' ? choice.port : null
  } else {
    port = await getGrantedDmxPort(undefined, {
      match: dmxPort ?? undefined,
      exclude: { usb: config.lighting.smoke.board },
    }).catch(() => null)
  }
  if (port && controller === lighting) {
    await useSerialPort(controller, port, driver)
  }
}

/** Interface débranchée puis rebranchée : on la reprend sans clic (même port ou même modèle). */
function watchReconnection(controller: LightingController): void {
  stopReconnectWatch?.()
  stopReconnectWatch = null
  // Sans interface connue, on ne prend pas n'importe quel port USB qui apparaît.
  if (!isWebSerialSupported() || !dmxPort) {
    return
  }
  const config = parsed.value.config
  stopReconnectWatch = watchDmxPortReconnection({
    match: dmxPort,
    exclude: { usb: config.lighting.smoke.board },
    onReconnect: (port) => {
      const { driver } = parsed.value.config.lighting
      const state = controller.getState()
      if (
        controller !== lighting ||
        driver === 'simulation' ||
        driver === 'artnet-bridge' ||
        preferSimulation
      ) {
        return
      }
      if (state.simulation || state.outputStatus === 'error' || state.outputStatus === 'closed') {
        void useSerialPort(controller, port, driver).catch(() => undefined)
      }
    },
  })
}

/**
 * Événement qui a lancé la scène de la phase en cours, rejoué à la reprise : la scène `question` de
 * `game_resumed` est l'ambiance de base, pas celle de l'intro de manche, du choix de thème ni d'un
 * extrait en cours. Rejoué par `handleGameEvent` : les liaisons de la salle (`lighting.bindings`)
 * restent respectées. `null` : la phase n'a pas de scène propre à reprendre.
 */
function phaseEvent(game: GameState): { type: string; payload: Record<string, unknown> } | null {
  const { phase } = game
  const round = game.rounds.at(-1)
  if (phase.name === 'round_intro' && round) {
    return {
      type: 'round_started',
      payload: { position: round.position, miniGame: round.miniGame },
    }
  }
  if (
    phase.name === 'theme_choice' &&
    round?.chooserParticipantId !== null &&
    round?.chooserParticipantId !== undefined
  ) {
    return {
      type: 'round_chooser_selected',
      payload: { participantId: round.chooserParticipantId },
    }
  }
  if (phase.name === 'question' && phase.miniGameState.kind === MINI_GAME_FLASH_BLIND_TEST) {
    const mini = phase.miniGameState
    if (mini.status === 'answering' && mini.answeringParticipantId !== null) {
      return { type: 'buzzer_pressed', payload: { participantId: mini.answeringParticipantId } }
    }
    return mini.status === 'playing' ? { type: 'blind_test_stage_resumed', payload: {} } : null
  }
  return null
}

async function createLighting(
  options: { emergencyReason?: string | null; disarmSmoke?: boolean } = {}
) {
  const lightingConfig = guardedLightingConfig(parsed.value.config)
  appliedLighting = stableStringify(lightingConfig)
  const controller = createLightingController({
    config: lightingConfig,
    output: createSimulationOutput(),
    resolveDesk,
  })
  // Fumée désarmée et arrêt d'urgence repris avant la première trame.
  if (options.disarmSmoke) {
    controller.smoke.disarm()
  }
  // Repris du redémarrage en cours, d'un arrêt pressé sans contrôleur, ou d'un arrêt d'avant
  // le rechargement de la page (clé locale).
  const emergencyReason = options.emergencyReason ?? pendingEmergency ?? readStoredEmergency()
  pendingEmergency = null
  if (emergencyReason) {
    controller.emergencyStop(emergencyReason)
  }
  lighting = controller
  lightingRef.value = controller
  let wasEmergency = controller.getState().emergency
  stopLightingState = controller.onChange((state) => {
    lightingState.value = state
    // Seul le réarmement (humain, confirmé) efface la mémoire de l'arrêt d'urgence.
    if (wasEmergency && !state.emergency) {
      writeStoredEmergency(null)
    }
    wasEmergency = state.emergency
  })
  // Pause : le contrôleur coupe le jet en cours et refuse tout nouveau jet (scène déjà lancée,
  // test manuel, test de gel) ; la reprise ne relance rien, la fumée ne revient que sur un nouvel
  // événement de jeu. Lu tout de suite (`immediate`) : des lumières créées ou recréées pendant une
  // pause naissent en pause. Aucun événement de jeu ne pilote les lumières pendant la pause,
  // sauf l'arrêt de la partie, qui les remet au repos.
  const { paused, state } = useRoomGame()
  const stopEvents = onGameEvents((events: GameEvent[]) => {
    for (const event of events) {
      if (!paused.value || event.type === 'game_aborted') {
        controller.handleGameEvent(event)
      }
    }
  })
  // Signaux de l'écran de salle (`game_paused`, `game_resumed`) : après la coupure de la fumée, hors
  // du filtre ci-dessus. La reprise rejoue la scène de la phase en cours ; sans pause préalable, ou
  // sans partie en cours (partie fermée pendant la pause), aucun signal.
  let signalledPause = false
  const stopPauseWatch = watch(
    paused,
    (isPaused) => {
      controller.setGamePaused(isPaused)
      if (isPaused === signalledPause) {
        return
      }
      const game = state.value
      if (isPaused) {
        signalledPause = true
        controller.handleGameEvent({ type: 'game_paused' })
      } else {
        signalledPause = false
        // Rejeu de reprise : la fumée n'est plus bloquée par la pause, donc `restore` (couleurs
        // seulement, ni jet ni éclair), même pour la scène de salle liée à ces événements.
        if (game) {
          controller.handleGameEvent({ type: 'game_resumed' }, { restore: true })
          const replay = phaseEvent(game)
          if (replay) {
            controller.handleGameEvent(replay, { restore: true })
          }
        }
      }
    },
    { flush: 'sync', immediate: true }
  )
  stopLightingEvents = () => {
    stopEvents()
    stopPauseWatch()
  }
  await controller.start()
  lightingState.value = controller.getState()
  // Interface déjà autorisée lors d'une visite précédente : reconnexion sans clic.
  await reconnectGrantedPort(controller).catch(() => undefined)
  watchReconnection(controller)
  return controller
}

async function shutdownLighting(): Promise<void> {
  const controller = lighting
  lighting = null
  lightingRef.value = null
  stopLightingEvents?.()
  stopLightingEvents = null
  stopLightingState?.()
  stopLightingState = null
  stopReconnectWatch?.()
  stopReconnectWatch = null
  clearBridgeRetry()
  meteredOutput = null
  bridgeArtnet.value = null
  activeBridge.value = null
  lightingState.value = null
  closingLighting = controller
  try {
    await controller?.stop()
  } finally {
    closingLighting = null
  }
}

/**
 * Arrêt d'urgence logiciel, jamais perdu : appliqué au contrôleur actif, à celui
 * qui se ferme, et retenu pour le prochain s'il est pressé pendant un redémarrage.
 */
export function triggerEmergencyStop(reason = 'operator'): void {
  writeStoredEmergency(reason)
  closingLighting?.emergencyStop(reason)
  if (lighting) {
    lighting.emergencyStop(reason)
  } else {
    pendingEmergency = reason
  }
}

/** Démarre (une seule fois) le contrôleur de lumières de la page. */
export async function startLighting(): Promise<LightingController> {
  // Toujours dans la file : un arrêt en attente passe avant, puis on redémarre.
  return serializeLighting(async () => lighting ?? createLighting())
}

export function getLighting(): LightingController | null {
  return lighting
}

/** Arrête les lumières (noir, fumée coupée) et libère l'interface DMX. */
export async function stopLighting(): Promise<void> {
  return serializeLighting(shutdownLighting)
}

/**
 * Relance le contrôleur avec la nouvelle config. L'arrêt d'urgence est conservé
 * et la fumée repart désarmée : seul un geste de l'opérateur la réautorise.
 */
async function restartLighting(): Promise<void> {
  return serializeLighting(async () => {
    if (!lighting) {
      return
    }
    const previous = lighting.getState()
    const emergencyReason = previous.emergency ? (previous.emergencyReason ?? 'operator') : null
    await shutdownLighting()
    await createLighting({ emergencyReason, disarmSmoke: true })
  })
}

/**
 * Retient le modèle USB de l'interface qui vient de s'ouvrir (`lighting.usb`), pour la retrouver
 * après un redémarrage. Rien n'est écrit si c'est déjà le même, ni si le port est celui de la carte
 * de la fumée : elle ne devient jamais « l'interface DMX » de la salle.
 */
async function rememberDmxPort(port: SerialPortLike): Promise<void> {
  const usb = portUsbId(port)
  const { config } = parsed.value
  const { board } = config.lighting.smoke
  const same = (left?: { usbVendorId?: number; usbProductId?: number }) =>
    left?.usbVendorId === usb?.usbVendorId && left?.usbProductId === usb?.usbProductId
  if (!usb || same(config.lighting.usb) || same(board)) {
    return
  }
  await saveRoomHardwareConfig({ ...config, lighting: { ...config.lighting, usb } })
}

/**
 * Bouton « Connecter l'interface DMX » : doit être appelé dans un clic (le
 * navigateur demande quelle interface USB utiliser).
 */
export async function connectDmxInterface(
  driver: DmxDriver = parsed.value.config.lighting.driver
): Promise<void> {
  if (driver === 'simulation') {
    throw new Error('simulation_driver')
  }
  if (driver === 'artnet-bridge') {
    const controller = await startLighting()
    preferSimulation = false
    // Même file que l'essai automatique : pas de course, et un échec repose le nouvel essai.
    await serializeLighting(() => autoConnectBridge(controller))
    return
  }
  // La fenêtre de choix doit s'ouvrir dans le clic, avant toute autre attente.
  const port = await requestDmxPort()
  const controller = await startLighting()
  preferSimulation = false
  await useSerialPort(controller, port, driver)
  watchReconnection(controller)
  await rememberDmxPort(port)
}

/** Revient à la salle simulée (débranchement volontaire de l'interface). */
export async function switchToSimulatedLights(
  output: DmxOutput = createSimulationOutput()
): Promise<void> {
  preferSimulation = true
  clearBridgeRetry()
  bridgeError.value = null
  bridgeArtnet.value = null
  activeBridge.value = null
  await lighting?.setOutput(output)
}

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * Où se trouve la dernière config enregistrée : compte de la salle, ce PC seulement,
 * ce PC faute de réseau (renvoyée plus tard), ce PC parce que le backoffice l'a refusée, ou
 * remplacée par celle du compte parce qu'un autre poste l'avait modifiée entre-temps (`conflict`).
 */
export type HardwareSyncStatus = 'local' | 'saved' | 'error' | 'rejected' | 'conflict'

/** Envoie la config avec la révision lue ; rend la nouvelle révision (`null` : backoffice sans révision). */
type RemoteSaver = (config: RoomHardwareConfig, revision: number | null) => Promise<number | null>

/**
 * État de la copie locale : compte de salle auquel elle se rapporte, empreinte du
 * jeton qui l'y a reliée (pour la retrouver hors ligne), et modifications pas encore envoyées.
 */
export type HardwareSyncMeta = {
  accountId: number | null
  tokenTag: string | null
  pending: boolean
  /** Révision de `rooms.config` à laquelle se rapporte la copie locale (`null` : inconnue). */
  revision: number | null
}

/** Compte de salle auquel partent les enregistrements. */
export type HardwareBinding = { accountId: number; tokenTag: string }

let remoteSaver: RemoteSaver | null = null
let binding: HardwareBinding | null = null
/**
 * La copie locale vient d'un autre compte de salle : rien n'est envoyé tant que la
 * config du compte connecté n'a pas été relue et appliquée.
 */
let foreignCopy = false
/** Révision de la config du compte, envoyée à chaque enregistrement (`null` : inconnue). */
let configRevision: number | null = null
/** Les enregistrements jusqu'à cette génération sont périmés (conflit résolu par la config du compte). */
let supersededUpTo = -1
/** Dernière config dont l'envoi a échoué sans réponse claire (peut-être reçue par le compte). */
let unconfirmedJson: string | null = null
/** Nombre de conflits résolus : les écrans qui gardent une copie de la config la rechargent. */
const conflictCount = shallowRef(0)
const syncStatus = shallowRef<HardwareSyncStatus>('local')
/** Incrémenté à chaque enregistrement local : une config relue avant est périmée. */
let saveGeneration = 0
/** Les envois partent un par un, dans l'ordre des enregistrements. */
let saveQueue: Promise<void> = Promise.resolve()

/** JSON aux clés triées : `jsonb` réordonne les clés, le contenu seul compte. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

const DEFAULT_CONFIG_JSON = stableStringify(defaultRoomHardwareConfig())

/** Config de salle neuve (rien d'associé, aucun appareil) : rien à transmettre ni à garder. */
export function isDefaultHardwareConfig(input: unknown): boolean {
  return (
    stableStringify(withoutUnknownKeys(parseRoomHardwareConfig(input).config)) ===
    DEFAULT_CONFIG_JSON
  )
}

export function getHardwareSyncMeta(): HardwareSyncMeta {
  try {
    const raw = getStorage()?.getItem(HARDWARE_SYNC_STORAGE_KEY)
    const value = raw ? (JSON.parse(raw) as Partial<HardwareSyncMeta>) : {}
    return {
      accountId: typeof value.accountId === 'number' ? value.accountId : null,
      tokenTag: typeof value.tokenTag === 'string' ? value.tokenTag : null,
      pending: value.pending === true,
      revision: Number.isInteger(value.revision) ? (value.revision as number) : null,
    }
  } catch {
    return { accountId: null, tokenTag: null, pending: false, revision: null }
  }
}

function writeSyncMeta(patch: Partial<HardwareSyncMeta>): void {
  try {
    getStorage()?.setItem(
      HARDWARE_SYNC_STORAGE_KEY,
      JSON.stringify({ ...getHardwareSyncMeta(), ...patch })
    )
  } catch {
    // Stockage indisponible.
  }
}

/** Révision de la config du compte, telle que connue de ce PC. */
export function getHardwareConfigRevision(): number | null {
  return configRevision
}

/** Mémorise la révision de la config du compte (lue, ou rendue par un enregistrement). */
export function setHardwareConfigRevision(revision: number | null | undefined): void {
  configRevision = revision ?? null
  writeSyncMeta({ revision: configRevision })
}

/** Numéro du dernier enregistrement local (voir `saveGeneration`). */
export function getHardwareSaveGeneration(): number {
  return saveGeneration
}

/**
 * Enregistrement côté backoffice (`rooms.config`) pour le compte de salle `next`.
 * Sans enregistreur (mode démo, compte inconnu), la config reste sur ce PC. Une
 * copie locale rattachée à un autre compte n'est jamais envoyée à celui-ci.
 */
export function setHardwareRemoteSaver(
  saver: RemoteSaver | null,
  next: HardwareBinding | null = null
): void {
  remoteSaver = saver && next ? saver : null
  binding = remoteSaver ? next : null
  syncStatus.value = 'local'
  foreignCopy = false
  configRevision = null
  supersededUpTo = -1
  unconfirmedJson = null
  if (binding) {
    const meta = getHardwareSyncMeta()
    if (meta.accountId !== null && meta.accountId !== binding.accountId) {
      foreignCopy = true
    } else {
      writeSyncMeta({ accountId: binding.accountId, tokenTag: binding.tokenTag })
      // La révision mémorisée vaut pour le compte auquel la copie est rattachée.
      configRevision = meta.accountId === null ? null : meta.revision
    }
  }
  // La preuve du test de coupure vaut pour une salle : un changement de compte la remet en cause.
  void refreshSmokeGuard().catch(() => undefined)
}

/** La copie locale appartient à un autre compte de salle que celui connecté. */
export function isHardwareCopyForeign(): boolean {
  return foreignCopy
}

// ── Garde de la fumée : test de coupure réussi sur ce PC ───────────────────

/**
 * La fumée n'est armée sur ce PC que si un test de coupure réussi y a été fait pour cette salle,
 * avec les réglages de fumée actuels. La config reçue du compte de la salle ne prouve rien : elle
 * peut venir d'un autre poste ou d'une écriture directe en base. Un seul point d'entrée : toute
 * config de lumières du contrôleur passe par `guardedLightingConfig`.
 */

/** Test de coupure en cours (config appliquée avec `smokeTest`) : la fumée peut y être active. */
let smokeTestActive = false
/** Config de lumières (JSON stable) avec laquelle tourne le contrôleur actuel. */
let appliedLighting = ''

type SmokeProof = { accountId: number | null; fingerprint: string }

function readSmokeProof(): SmokeProof | null {
  try {
    const raw = getStorage()?.getItem(SMOKE_PROOF_STORAGE_KEY)
    const value = raw ? (JSON.parse(raw) as Partial<SmokeProof>) : null
    return value &&
      typeof value.fingerprint === 'string' &&
      (value.accountId === null || typeof value.accountId === 'number')
      ? { accountId: value.accountId, fingerprint: value.fingerprint }
      : null
  } catch {
    return null
  }
}

/**
 * Empreinte des réglages de fumée testés : interface DMX et sa cible (nœud Art-Net, adresse du
 * pont), durées, niveau, confirmation, et pour chaque sortie fumée son adresse, son univers et ses
 * canaux. Une sortie fumée se reconnaît comme dans le contrôleur de lumières : type `smoke` ou
 * tout canal de rôle `smoke`, quel que soit le type de l'appareil. `enabled` n'en fait pas
 * partie : c'est justement ce que la garde contrôle.
 */
function smokeFingerprint(rig: LightingConfig): string {
  const devices = parseRig(rig.fixtures, rig.customProfiles)
    .fixtures.filter(
      (fixture) =>
        fixture.profile.kind === 'smoke' ||
        fixture.profile.channels.some((channel) => channel.role === 'smoke')
    )
    .map(({ id, address, universe, profile }) => ({
      id,
      address,
      universe: universe ?? 0,
      channels: profile.channels,
    }))
  return stableStringify({
    driver: rig.driver,
    artnet: rig.artnet,
    bridgeUrl: rig.bridgeUrl,
    smoke: { ...rig.smoke, enabled: undefined },
    devices,
  })
}

/** La fumée est activée par la config, mais aucune preuve locale ne la couvre : elle est refusée. */
function smokeGuardBlocks(rig: LightingConfig): boolean {
  if (!rig.smoke.enabled || smokeTestActive) {
    return false
  }
  const proof = readSmokeProof()
  return !(
    proof !== null &&
    proof.accountId === (binding?.accountId ?? null) &&
    proof.fingerprint === smokeFingerprint(rig)
  )
}

/** Config de lumières du contrôleur : la fumée y est désactivée tant que la preuve manque. */
function guardedLightingConfig(config: RoomHardwareConfig): LightingConfig {
  const rig = activeLightingConfig(config)
  return smokeGuardBlocks(rig) ? { ...rig, smoke: { ...rig.smoke, enabled: false } } : rig
}

const smokeNeedsTest = shallowRef(smokeGuardBlocks(activeLightingConfig(parsed.value.config)))

function syncSmokeNeedsTest(): void {
  smokeNeedsTest.value = smokeGuardBlocks(activeLightingConfig(parsed.value.config))
}

/** La salle ou la preuve a changé : le contrôleur repart si la garde ne donne plus le même résultat. */
async function refreshSmokeGuard(): Promise<void> {
  syncSmokeNeedsTest()
  if (lighting && stableStringify(guardedLightingConfig(parsed.value.config)) !== appliedLighting) {
    await restartLighting()
  }
}

/**
 * Résultat d'un test de coupure de la fumée fait sur ce PC (réponse de l'installateur). Réussi :
 * la preuve est écrite pour cette salle et ces réglages ; elle ne s'écrit que pendant un test
 * (config appliquée avec `smokeTest`). Échoué : la preuve existante est effacée (l'assistant
 * appelle aussi `false` dès qu'un test part, voir `onFreezeTest`). Un test abandonné n'appelle
 * rien. Rend `true` seulement si la preuve est posée ; `false` si la réponse était négative, si la
 * config a changé pendant le test, ou si le stockage a refusé l'écriture.
 */
export function recordSmokeCutoffResult(ok: boolean): boolean {
  let written = false
  try {
    if (!ok) {
      getStorage()?.removeItem(SMOKE_PROOF_STORAGE_KEY)
    } else if (smokeTestActive) {
      const proof: SmokeProof = {
        accountId: binding?.accountId ?? null,
        fingerprint: smokeFingerprint(activeLightingConfig(parsed.value.config)),
      }
      const store = getStorage()
      store?.setItem(SMOKE_PROOF_STORAGE_KEY, JSON.stringify(proof))
      written = store !== null
    }
  } catch {
    // Stockage indisponible : pas de preuve, la fumée reste refusée.
  }
  syncSmokeNeedsTest()
  return written
}

async function applyConfig(
  input: unknown,
  options: { persist?: boolean; smokeTest?: boolean } = {}
): Promise<ParsedRoomHardwareConfig> {
  const next = parseRoomHardwareConfig(input)
  smokeTestActive = options.smokeTest === true
  parsed.value = next

  // Copie locale de secours (backoffice injoignable au prochain démarrage).
  if (options.persist !== false) {
    try {
      getStorage()?.setItem(HARDWARE_STORAGE_KEY, JSON.stringify(next.config))
    } catch {
      // Stockage indisponible : la config vaut jusqu'au rechargement.
    }
  }

  applyBuzzerConfig(next.config)
  syncSmokeNeedsTest()

  if (stableStringify(guardedLightingConfig(next.config)) !== appliedLighting) {
    await restartLighting()
  }
  return next
}

/**
 * Envoie la config actuelle au compte de la salle, après les envois déjà en cours.
 * La copie locale reste « à envoyer » tant que le dernier enregistrement n'est pas passé.
 */
export function pushHardwareConfig(
  config: RoomHardwareConfig = parsed.value.config,
  generation = saveGeneration
): Promise<void> {
  const saver = remoteSaver
  if (!saver) {
    return Promise.resolve()
  }
  if (foreignCopy) {
    // Copie modifiée sans savoir pour quel compte : elle ne part plus vers aucun,
    // pas même vers son compte d'origine.
    writeSyncMeta({ pending: false })
    return Promise.resolve()
  }
  writeSyncMeta({ pending: true })

  const run = async (): Promise<void> => {
    // Un conflit a remplacé la config par celle du compte : cet envoi, préparé sur l'ancienne,
    // ne part pas (jamais de renvoi automatique après un 409).
    if (generation <= supersededUpTo) {
      return
    }
    try {
      setHardwareConfigRevision(await sendConfig(saver, config))
      unconfirmedJson = null
      if (generation === saveGeneration) {
        writeSyncMeta({ pending: false })
        syncStatus.value = 'saved'
      }
    } catch (caught) {
      const conflict = caught instanceof RoomApiError ? caught.configConflict : null
      if (conflict) {
        // Un autre poste a enregistré entre-temps : sa version, la plus récente, l'emporte ici.
        await resolveHardwareConflict(conflict.config, conflict.configRevision)
      } else if (generation === saveGeneration) {
        // Un 400 (config trop volumineuse ou invalide) ne passera pas mieux plus tard :
        // elle n'est pas renvoyée, le prochain démarrage reprend celle du compte.
        const rejected = caught instanceof RoomApiError && caught.status === 400
        if (rejected) {
          writeSyncMeta({ pending: false })
        } else {
          // Réponse peut-être perdue alors que le compte l'a reçue (voir `sendConfig`).
          unconfirmedJson = stableStringify(config)
        }
        syncStatus.value = rejected ? 'rejected' : 'error'
      }
    }
  }
  const sent = saveQueue.then(run)
  // Un envoi ne bloque jamais les suivants, quoi qu'il lui arrive.
  saveQueue = sent.catch(() => undefined)
  return sent
}

/**
 * Un envoi dont la réponse s'est perdue a pu passer : le suivant reçoit alors un 409 sur
 * notre propre écriture. Si la config du compte est celle qu'on a tenté d'envoyer, on adopte
 * sa révision et on renvoie une fois (pas de conflit, personne d'autre n'a écrit).
 * ponytail: comparaison exacte des JSON ; une section ajoutée côté backoffice entre-temps
 * fait passer pour un vrai conflit (le compte l'emporte), sans perte de données.
 */
async function sendConfig(saver: RemoteSaver, config: RoomHardwareConfig): Promise<number | null> {
  try {
    return await saver(config, configRevision)
  } catch (caught) {
    const conflict = caught instanceof RoomApiError ? caught.configConflict : null
    if (
      !conflict ||
      unconfirmedJson === null ||
      stableStringify(conflict.config) !== unconfirmedJson
    ) {
      throw caught
    }
    unconfirmedJson = null
    setHardwareConfigRevision(conflict.configRevision)
    return saver(config, conflict.configRevision)
  }
}

/**
 * Un autre poste a écrit sur le compte : sa config remplace celle de ce PC (copie locale
 * comprise) et sa révision est retenue. Les enregistrements faits jusque-là ne partent plus.
 * Un enregistrement de l'opérateur fait pendant l'application reste « à envoyer ».
 */
export async function resolveHardwareConflict(config: unknown, revision: number): Promise<void> {
  const generation = saveGeneration
  supersededUpTo = generation
  unconfirmedJson = null
  try {
    await applyRemoteHardwareConfig(config, revision)
  } catch {
    syncStatus.value = 'error'
    return
  }
  if (generation === saveGeneration) {
    writeSyncMeta({ pending: false })
    syncStatus.value = 'conflict'
    conflictCount.value += 1
  }
}

/**
 * Enregistre la config de salle (normalisée) et l'applique : nouveau mapping des
 * buzzers, et contrôleur de lumières relancé seulement si la partie lumières a changé.
 * Elle part ensuite sur le compte de la salle ; en cas d'échec, elle reste sur ce PC
 * et sera renvoyée au prochain démarrage.
 */
export async function saveRoomHardwareConfig(
  input: unknown,
  options: { persist?: boolean; smokeTest?: boolean } = {}
): Promise<ParsedRoomHardwareConfig> {
  // `persist: false` : config appliquée à la page seulement, jamais gardée sur ce PC ni envoyée
  // au compte de la salle. Avec `smokeTest` (test de coupure de la fumée, assistant seulement),
  // la fumée y reste active malgré l'absence de preuve locale, jusqu'à la config suivante.
  if (options.persist === false) {
    return applyConfig(input, { persist: false, smokeTest: options.smokeTest })
  }
  saveGeneration += 1
  const generation = saveGeneration
  const next = await applyConfig(input)
  await pushHardwareConfig(next.config, generation)
  return next
}

/**
 * Config relue depuis le compte connecté : appliquée sans être renvoyée. La copie
 * locale lui est désormais rattachée. Un enregistrement local fait pendant
 * l'application reste « à envoyer ».
 */
export async function applyRemoteHardwareConfig(
  input: unknown,
  revision?: number | null
): Promise<void> {
  const generation = saveGeneration
  await applyConfig(input)
  if (!binding) {
    return
  }
  foreignCopy = false
  writeSyncMeta({ accountId: binding.accountId, tokenTag: binding.tokenTag })
  if (revision !== undefined) {
    setHardwareConfigRevision(revision)
  }
  if (generation === saveGeneration) {
    writeSyncMeta({ pending: false })
    syncStatus.value = 'saved'
  }
}

/** Config actuelle (normalisée), par exemple pour la pousser vers le backoffice. */
export function getRoomHardwareConfig(): RoomHardwareConfig {
  return parsed.value.config
}

/** Change la source des buzzers (clavier ou carte manette) : le lecteur suit tout de suite. */
export async function saveBuzzerSource(source: BuzzerSource): Promise<ParsedRoomHardwareConfig> {
  const config = parsed.value.config
  return saveRoomHardwareConfig({ ...config, buzzers: { ...config.buzzers, source } })
}

/**
 * Enregistre l'IP du nœud Art-Net (pilote `artnet-bridge`, chaîne vide = pas de réglage). Les lumières
 * redémarrent et la cible repart au pont dans le `hello` de la nouvelle connexion.
 */
export async function saveArtnetTarget(target: string): Promise<ParsedRoomHardwareConfig> {
  return saveRoomHardwareConfig(withArtnetTarget(parsed.value.config, target))
}

/** Enregistre seulement le mapping des buzzers (fin de l'apprentissage). */
export async function saveBuzzerKeymap(keymap: BuzzerKeymap): Promise<ParsedRoomHardwareConfig> {
  return saveRoomHardwareConfig({
    ...parsed.value.config,
    buzzers: { ...parsed.value.config.buzzers, keymap },
  })
}

/**
 * Source des buzzers avec l'`id` de la carte manette lue en ce moment (apprise à l'instant : son
 * identité est retenue pour la retrouver après un redémarrage). Sans carte lue, ou si plusieurs
 * cartes identiques sont branchées, la config est rendue telle quelle : on ne retient pas une carte
 * au hasard.
 */
function withLearnedGamepadId(config: RoomHardwareConfig): RoomHardwareConfig {
  const { source } = config.buzzers
  const pad = device && 'getGamepad' in device ? device.getGamepad() : null
  return source?.kind === 'gamepad' && pad
    ? { ...config, buzzers: { ...config.buzzers, source: { ...source, id: pad.id } } }
    : config
}

/** Enregistre les buzzers appris sur les pupitres de la salle (la réserve est gardée, cf. `withLearnedKeymap`). */
export async function saveLearnedBuzzers(learned: BuzzerKeymap): Promise<ParsedRoomHardwareConfig> {
  return saveRoomHardwareConfig(
    withLearnedGamepadId(withLearnedKeymap(parsed.value.config, learned))
  )
}

/**
 * Enregistre le nombre de pupitres de la salle (1 à 6, 4 par défaut) : lobby, apprentissage des
 * buzzers, test, lumières et mapping de simulation suivent. Les buzzers appris et l'affectation des
 * lumières des pupitres au-delà restent en réserve dans la config, sans effet, et reviennent si
 * on remonte le nombre (voir `withDesksCount`). Le backoffice relit le nombre pour ne proposer que
 * ces pupitres au lancement d'une partie.
 */
export async function saveRoomDesksCount(count: number): Promise<ParsedRoomHardwareConfig> {
  return saveRoomHardwareConfig(withDesksCount(parsed.value.config, count))
}

/**
 * Fin du parcours plein écran : disposition, nombre de pupitres et buzzers appris, enregistrés en
 * une seule fois (un seul envoi au compte de la salle), et configuration marquée faite.
 */
export async function saveRoomSetup(setup: {
  layout: BuzzerLayout
  desksCount: number
  keymap: BuzzerKeymap
}): Promise<ParsedRoomHardwareConfig> {
  const { config } = parsed.value
  const sized = withDesksCount(withBuzzerLayout(config, setup.layout), setup.desksCount)
  // Une place laissée de côté (« Passer ») garde son ancienne touche, sauf si cette touche ou
  // cette place a été reprise pendant le parcours.
  const taken = new Set(Object.values(setup.keymap).map((slot) => `${slot.desk}${slot.button}`))
  const kept = Object.entries(config.buzzers.keymap).filter(
    ([code, slot]) => !Object.hasOwn(setup.keymap, code) && !taken.has(`${slot.desk}${slot.button}`)
  )
  const keymap = { ...Object.fromEntries(kept), ...setup.keymap }
  return saveRoomHardwareConfig({
    ...withLearnedGamepadId(withLearnedKeymap(sized, keymap)),
    setupDone: true,
  })
}

/** Enregistre la couleur et la place des buzzers (écran de jeu, apprentissage et plan suivent). */
export async function saveBuzzerLayout(layout: BuzzerLayout): Promise<ParsedRoomHardwareConfig> {
  return saveRoomHardwareConfig(withBuzzerLayout(parsed.value.config, layout))
}

/** Enregistre la position d'un élément du plan de salle (écran, pupitre ou appareil). */
export async function saveRoomPlanPoint(
  target: PlanTarget,
  point: PlanPoint
): Promise<ParsedRoomHardwareConfig> {
  return saveRoomHardwareConfig(withPlanPoint(parsed.value.config, target, point))
}

/** Remet à zéro tout le matériel de la page (tests). */
export async function resetRoomHardware(options: { storage?: HardwareStorage | null } = {}) {
  await stopLighting()
  setBuzzerInput(null)
  preferSimulation = false
  pendingEmergency = null
  dmxPort = null
  dmxPortProblem.value = null
  bridgeError.value = null
  bridgeArtnet.value = null
  activeBridge.value = null
  remoteSaver = null
  binding = null
  foreignCopy = false
  configRevision = null
  supersededUpTo = -1
  unconfirmedJson = null
  conflictCount.value = 0
  syncStatus.value = 'local'
  saveGeneration = 0
  saveQueue = Promise.resolve()
  smokeTestActive = false
  appliedLighting = ''
  storage = options.storage ?? null
  parsed.value = parseRoomHardwareConfig(loadStoredConfig())
  syncSmokeNeedsTest()
}

export function useRoomHardware() {
  return {
    hardware: computed(() => parsed.value),
    /** Pupitres de la salle : 1 à `desksCount` (4 par défaut). */
    desks: computed(() => desksForCount(parsed.value.config.desksCount)),
    /** Aucun buzzer associé et parcours de configuration jamais terminé : première connexion. */
    setupNeeded: computed(
      () =>
        Object.keys(parsed.value.config.buzzers.keymap).length === 0 &&
        !parsed.value.config.setupDone
    ),
    keymap: computed(() => effectiveKeymap(parsed.value.config)),
    /** Interface DMX retenue non reprise après un redémarrage (voir `dmxPortProblem`). */
    dmxPortProblem: computed(() => dmxPortProblem.value),
    /** Nombre de cartes manettes identiques qui correspondent au choix ; 0 : pas d'ambiguïté. */
    buzzerCardAmbiguous: computed(() => buzzerCardAmbiguous.value),
    usesGamepad: computed(() => parsed.value.config.buzzers.source?.kind === 'gamepad'),
    // La carte manette ne lit pas le clavier : pas de touches de simulation avec elle.
    usesSimulationKeys: computed(
      () =>
        Object.keys(activeKeymap(parsed.value.config)).length === 0 &&
        parsed.value.config.buzzers.source?.kind !== 'gamepad'
    ),
    buzzerState: computed(() => buzzerState.value),
    lightingState: computed(() => lightingState.value),
    lighting: computed(() => lightingRef.value),
    /**
     * Fumée activée dans la config, mais refusée sur ce PC : pas de test de coupure réussi ici pour
     * cette salle et ces réglages (voir `recordSmokeCutoffResult`).
     */
    smokeNeedsTest: computed(() => smokeNeedsTest.value),
    syncStatus: computed(() => syncStatus.value),
    /** Incrémenté à chaque conflit résolu par la config du compte (voir `resolveHardwareConflict`). */
    conflictCount: computed(() => conflictCount.value),
    /** Pourquoi le pont Art-Net n'est pas connecté (`null` : connecté, ou pas essayé). */
    bridgeError: computed(() => bridgeError.value),
    /**
     * Cible Art-Net effective annoncée par le pont (`source` : `cli`, `room` ou `none`). `null` dès que
     * le pont n'est plus connecté (sortie fermée, en erreur, ou simulation) : plus de cible affichée.
     */
    bridgeArtnet: computed(() => {
      const state = lightingState.value
      return state && !state.simulation && state.outputStatus === 'open' ? bridgeArtnet.value : null
    }),
    /**
     * Capacités annoncées par le pont connecté (`poll` : recherche des nœuds) ; `null` tant que le
     * pont n'est pas connecté, `[]` pour un pont ancien.
     */
    bridgeFeatures: computed(() => {
      const state = lightingState.value
      return state && !state.simulation && state.outputStatus === 'open'
        ? (activeBridge.value?.features() ?? null)
        : null
    }),
  }
}
