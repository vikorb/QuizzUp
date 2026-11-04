import type { GameEvent } from '@quizzup/game-engine'
import {
  type BuzzerInput,
  type BuzzerInputState,
  type BuzzerKeymap,
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
  type Desk,
  desksForCount,
  type DmxDriver,
  type DmxOutput,
  type GamepadBuzzerInput,
  gamepadMatcher,
  getGrantedDmxPort,
  isDesk,
  isWebSerialSupported,
  type KeyboardBuzzerInput,
  type LightingController,
  type LightingState,
  type MeteredOutput,
  type OutputStats,
  type ParsedRoomHardwareConfig,
  parseRoomHardwareConfig,
  type RawKeyPress,
  requestDmxPort,
  type RoomHardwareConfig,
  type SerialPortLike,
  watchDmxPortReconnection,
} from '@quizzup/hardware'
import { computed, shallowRef } from 'vue'

import { onGameEvents } from '@/game/useRoomGame'
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

/** Aucun buzzer associé : on joue avec le clavier de simulation. */
function effectiveKeymap(config: RoomHardwareConfig): BuzzerKeymap {
  return Object.keys(config.buzzers.keymap).length > 0
    ? config.buzzers.keymap
    : createSimulationKeymap(config.desksCount)
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

let device: BuzzerDevice | null = null
let deviceKey = ''
let detachDevice: (() => void) | null = null
const pressListeners = new Set<(press: BuzzerPress) => void>()
const keyListeners = new Set<(key: RawKeyPress) => void>()
const changeListeners = new Set<(state: BuzzerInputState) => void>()

function buzzerSourceKey(config: RoomHardwareConfig): string {
  const source = config.buzzers.source
  return source?.kind === 'gamepad' ? `gamepad:${source.match ?? ''}` : 'keyboard'
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
}

/** (Re)crée le lecteur pour la source de la config ; les abonnés de la page sont gardés. */
function attachDevice(config: RoomHardwareConfig): BuzzerDevice {
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
    next.onChange((state) => emitTo(changeListeners, state)),
  ]
  detachDevice = () => {
    for (const off of offs) {
      off()
    }
  }
  device = next
  deviceKey = buzzerSourceKey(config)
  emitTo(changeListeners, next.getState())
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

/** Capte Échap, Alt+Tab… en plein écran (Chrome / Edge), pour ne pas sortir du jeu. */
export async function lockBuzzerSystemKeys(): Promise<boolean> {
  getBuzzerInput()
  return device && 'lockSystemKeys' in device ? device.lockSystemKeys() : false
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
let stopReconnectWatch: (() => void) | null = null
/** Le pont Art-Net a été connecté par un clic : on le reprend après un redémarrage des lumières. */
let bridgeConnected = false

async function useBridge(controller: LightingController): Promise<void> {
  const output = createMeteredOutput(
    createBridgeOutput({ url: parsed.value.config.lighting.bridgeUrl ?? DEFAULT_BRIDGE_URL })
  )
  meteredOutput = output
  dmxPort = null
  await controller.setOutput(output)
  bridgeConnected = true
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
  // Le pont se connecte la première fois au clic (Chrome peut demander l'accès au réseau
  // local), puis il est repris sans clic à chaque redémarrage des lumières.
  if (driver === 'artnet-bridge') {
    if (bridgeConnected && controller === lighting) {
      await useBridge(controller)
    }
    return
  }
  if (!isWebSerialSupported()) {
    return
  }
  // On reprend la même interface (jamais un autre appareil USB autorisé, Arduino…).
  const port = await getGrantedDmxPort(undefined, { match: dmxPort ?? undefined }).catch(() => null)
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
  stopReconnectWatch = watchDmxPortReconnection({
    match: dmxPort,
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

async function createLighting(
  options: { emergencyReason?: string | null; disarmSmoke?: boolean } = {}
) {
  const controller = createLightingController({
    config: parsed.value.config.lighting,
    output: createSimulationOutput(),
    resolveDesk,
  })
  // Fumée désarmée et arrêt d'urgence repris avant la première trame.
  if (options.disarmSmoke) {
    controller.smoke.disarm()
  }
  const emergencyReason = options.emergencyReason ?? pendingEmergency
  pendingEmergency = null
  if (emergencyReason) {
    controller.emergencyStop(emergencyReason)
  }
  lighting = controller
  lightingRef.value = controller
  stopLightingState = controller.onChange((state) => {
    lightingState.value = state
  })
  stopLightingEvents = onGameEvents((events: GameEvent[]) => {
    for (const event of events) {
      controller.handleGameEvent(event)
    }
  })
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
  meteredOutput = null
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
    await useBridge(controller)
    return
  }
  // La fenêtre de choix doit s'ouvrir dans le clic, avant toute autre attente.
  const port = await requestDmxPort()
  const controller = await startLighting()
  preferSimulation = false
  await useSerialPort(controller, port, driver)
  watchReconnection(controller)
}

/** Revient à la salle simulée (débranchement volontaire de l'interface). */
export async function switchToSimulatedLights(
  output: DmxOutput = createSimulationOutput()
): Promise<void> {
  preferSimulation = true
  bridgeConnected = false
  await lighting?.setOutput(output)
}

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * Où se trouve la dernière config enregistrée : compte de la salle, ce PC seulement,
 * ce PC faute de réseau (renvoyée plus tard), ou ce PC parce que le backoffice l'a refusée.
 */
export type HardwareSyncStatus = 'local' | 'saved' | 'error' | 'rejected'

type RemoteSaver = (config: RoomHardwareConfig) => Promise<void>

/**
 * État de la copie locale : compte de salle auquel elle se rapporte, empreinte du
 * jeton qui l'y a reliée (pour la retrouver hors ligne), et modifications pas encore envoyées.
 */
export type HardwareSyncMeta = {
  accountId: number | null
  tokenTag: string | null
  pending: boolean
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
  return stableStringify(parseRoomHardwareConfig(input).config) === DEFAULT_CONFIG_JSON
}

export function getHardwareSyncMeta(): HardwareSyncMeta {
  try {
    const raw = getStorage()?.getItem(HARDWARE_SYNC_STORAGE_KEY)
    const value = raw ? (JSON.parse(raw) as Partial<HardwareSyncMeta>) : {}
    return {
      accountId: typeof value.accountId === 'number' ? value.accountId : null,
      tokenTag: typeof value.tokenTag === 'string' ? value.tokenTag : null,
      pending: value.pending === true,
    }
  } catch {
    return { accountId: null, tokenTag: null, pending: false }
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
  if (binding) {
    const meta = getHardwareSyncMeta()
    if (meta.accountId !== null && meta.accountId !== binding.accountId) {
      foreignCopy = true
    } else {
      writeSyncMeta({ accountId: binding.accountId, tokenTag: binding.tokenTag })
    }
  }
}

/** La copie locale appartient à un autre compte de salle que celui connecté. */
export function isHardwareCopyForeign(): boolean {
  return foreignCopy
}

async function applyConfig(
  input: unknown,
  options: { persist?: boolean } = {}
): Promise<ParsedRoomHardwareConfig> {
  const previousLighting = stableStringify(parsed.value.config.lighting)
  const next = parseRoomHardwareConfig(input)
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

  if (stableStringify(next.config.lighting) !== previousLighting) {
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
    try {
      await saver(config)
      if (generation === saveGeneration) {
        writeSyncMeta({ pending: false })
        syncStatus.value = 'saved'
      }
    } catch (caught) {
      if (generation === saveGeneration) {
        // Un 400 (config trop volumineuse ou invalide) ne passera pas mieux plus tard :
        // elle n'est pas renvoyée, le prochain démarrage reprend celle du compte.
        const rejected = caught instanceof RoomApiError && caught.status === 400
        if (rejected) {
          writeSyncMeta({ pending: false })
        }
        syncStatus.value = rejected ? 'rejected' : 'error'
      }
    }
  }
  const sent = saveQueue.then(run)
  saveQueue = sent
  return sent
}

/**
 * Enregistre la config de salle (normalisée) et l'applique : nouveau mapping des
 * buzzers, et contrôleur de lumières relancé seulement si la partie lumières a changé.
 * Elle part ensuite sur le compte de la salle ; en cas d'échec, elle reste sur ce PC
 * et sera renvoyée au prochain démarrage.
 */
export async function saveRoomHardwareConfig(
  input: unknown,
  options: { persist?: boolean } = {}
): Promise<ParsedRoomHardwareConfig> {
  // `persist: false` : config appliquée à la page seulement (test de coupure de la fumée),
  // jamais gardée sur ce PC ni envoyée au compte de la salle.
  if (options.persist === false) {
    return applyConfig(input, { persist: false })
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
export async function applyRemoteHardwareConfig(input: unknown): Promise<void> {
  const generation = saveGeneration
  await applyConfig(input)
  if (!binding) {
    return
  }
  foreignCopy = false
  writeSyncMeta({ accountId: binding.accountId, tokenTag: binding.tokenTag })
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

/** Enregistre seulement le mapping des buzzers (fin de l'apprentissage). */
export async function saveBuzzerKeymap(keymap: BuzzerKeymap): Promise<ParsedRoomHardwareConfig> {
  return saveRoomHardwareConfig({
    ...parsed.value.config,
    buzzers: { ...parsed.value.config.buzzers, keymap },
  })
}

/**
 * Enregistre le nombre de pupitres de la salle (1 à 6, 4 par défaut) : lobby, apprentissage des
 * buzzers, test et mapping de simulation suivent. Le backoffice le relit pour ne proposer que
 * ces pupitres au lancement d'une partie.
 */
export async function saveRoomDesksCount(count: number): Promise<ParsedRoomHardwareConfig> {
  return saveRoomHardwareConfig({ ...parsed.value.config, desksCount: count })
}

/** Pupitres de la salle (1 à `desksCount`), hors de tout composant. */
export function getRoomDesks(): Desk[] {
  return desksForCount(parsed.value.config.desksCount)
}

/** Remet à zéro tout le matériel de la page (tests). */
export async function resetRoomHardware(options: { storage?: HardwareStorage | null } = {}) {
  await stopLighting()
  setBuzzerInput(null)
  preferSimulation = false
  pendingEmergency = null
  dmxPort = null
  bridgeConnected = false
  remoteSaver = null
  binding = null
  foreignCopy = false
  syncStatus.value = 'local'
  saveGeneration = 0
  saveQueue = Promise.resolve()
  storage = options.storage ?? null
  parsed.value = parseRoomHardwareConfig(loadStoredConfig())
}

export function useRoomHardware() {
  return {
    hardware: computed(() => parsed.value),
    /** Pupitres de la salle : 1 à `desksCount` (4 par défaut). */
    desks: computed(() => desksForCount(parsed.value.config.desksCount)),
    keymap: computed(() => effectiveKeymap(parsed.value.config)),
    usesGamepad: computed(() => parsed.value.config.buzzers.source?.kind === 'gamepad'),
    // La carte manette ne lit pas le clavier : pas de touches de simulation avec elle.
    usesSimulationKeys: computed(
      () =>
        Object.keys(parsed.value.config.buzzers.keymap).length === 0 &&
        parsed.value.config.buzzers.source?.kind !== 'gamepad'
    ),
    buzzerState: computed(() => buzzerState.value),
    lightingState: computed(() => lightingState.value),
    lighting: computed(() => lightingRef.value),
    syncStatus: computed(() => syncStatus.value),
  }
}
