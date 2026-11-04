import type { GameEvent } from '@quizzup/game-engine'
import {
  type BuzzerInput,
  type BuzzerInputState,
  type BuzzerKeymap,
  createKeyboardBuzzerInput,
  createLightingController,
  createSerialOutput,
  createSimulationOutput,
  defaultRoomHardwareConfig,
  type DmxOutput,
  getGrantedDmxPort,
  isDesk,
  isWebSerialSupported,
  type KeyboardBuzzerInput,
  type LightingController,
  type LightingState,
  type ParsedRoomHardwareConfig,
  parseRoomHardwareConfig,
  requestDmxPort,
  type RoomHardwareConfig,
} from '@quizzup/hardware'
import { computed, shallowRef } from 'vue'

import { onGameEvents } from '@/game/useRoomGame'
import { SIMULATION_KEYMAP } from '@/hardware/buzzers'
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
    : { ...SIMULATION_KEYMAP }
}

// ── Buzzers ────────────────────────────────────────────────────────────────

let buzzerInput: BuzzerInput | null = null
let keyboardInput: KeyboardBuzzerInput | null = null
let stopBuzzerState: (() => void) | null = null
const buzzerState = shallowRef<BuzzerInputState | null>(null)

function watchBuzzers(input: BuzzerInput): void {
  stopBuzzerState?.()
  buzzerState.value = input.getState()
  stopBuzzerState = input.onChange((state) => {
    buzzerState.value = state
  })
}

/** Entrée buzzers de la page (clavier, avec le mapping appris de la salle). */
export function getBuzzerInput(): BuzzerInput {
  if (!buzzerInput) {
    keyboardInput = createKeyboardBuzzerInput({ keymap: effectiveKeymap(parsed.value.config) })
    buzzerInput = keyboardInput
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
  keyboardInput = null
  buzzerState.value = null
  if (input) {
    watchBuzzers(input)
  }
}

/** Capte Échap, Alt+Tab… en plein écran (Chrome / Edge), pour ne pas sortir du jeu. */
export async function lockBuzzerSystemKeys(): Promise<boolean> {
  getBuzzerInput()
  return keyboardInput ? keyboardInput.lockSystemKeys() : false
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

async function reconnectGrantedPort(controller: LightingController): Promise<void> {
  const { driver } = parsed.value.config.lighting
  if (driver === 'simulation' || preferSimulation || !isWebSerialSupported()) {
    return
  }
  const port = await getGrantedDmxPort().catch(() => null)
  if (port && controller === lighting) {
    await controller.setOutput(createSerialOutput({ port, driver }))
  }
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
export async function connectDmxInterface(): Promise<void> {
  const { driver } = parsed.value.config.lighting
  if (driver === 'simulation') {
    throw new Error('simulation_driver')
  }
  // La fenêtre de choix doit s'ouvrir dans le clic, avant toute autre attente.
  const port = await requestDmxPort()
  const controller = await startLighting()
  preferSimulation = false
  await controller.setOutput(createSerialOutput({ port, driver }))
}

/** Revient à la salle simulée (débranchement volontaire de l'interface). */
export async function switchToSimulatedLights(
  output: DmxOutput = createSimulationOutput()
): Promise<void> {
  preferSimulation = true
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

async function applyConfig(input: unknown): Promise<ParsedRoomHardwareConfig> {
  const previousLighting = stableStringify(parsed.value.config.lighting)
  const next = parseRoomHardwareConfig(input)
  parsed.value = next

  // Copie locale de secours (backoffice injoignable au prochain démarrage).
  try {
    getStorage()?.setItem(HARDWARE_STORAGE_KEY, JSON.stringify(next.config))
  } catch {
    // Stockage indisponible : la config vaut jusqu'au rechargement.
  }

  keyboardInput?.setKeymap(effectiveKeymap(next.config))

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
  if (!saver || foreignCopy) {
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
export async function saveRoomHardwareConfig(input: unknown): Promise<ParsedRoomHardwareConfig> {
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

/** Enregistre seulement le mapping des buzzers (fin de l'apprentissage). */
export async function saveBuzzerKeymap(keymap: BuzzerKeymap): Promise<ParsedRoomHardwareConfig> {
  return saveRoomHardwareConfig({ ...parsed.value.config, buzzers: { keymap } })
}

/** Remet à zéro tout le matériel de la page (tests). */
export async function resetRoomHardware(options: { storage?: HardwareStorage | null } = {}) {
  await stopLighting()
  setBuzzerInput(null)
  preferSimulation = false
  pendingEmergency = null
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
    keymap: computed(() => effectiveKeymap(parsed.value.config)),
    usesSimulationKeys: computed(
      () => Object.keys(parsed.value.config.buzzers.keymap).length === 0
    ),
    buzzerState: computed(() => buzzerState.value),
    lightingState: computed(() => lightingState.value),
    lighting: computed(() => lightingRef.value),
    syncStatus: computed(() => syncStatus.value),
  }
}
