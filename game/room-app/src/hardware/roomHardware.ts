import type { GameEvent } from '@quizzup/game-engine'
import {
  type BuzzerInput,
  type BuzzerInputState,
  type BuzzerKeymap,
  createKeyboardBuzzerInput,
  createLightingController,
  createSerialOutput,
  createSimulationOutput,
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

/**
 * Matériel de la salle, partagé par tous les écrans : config (`rooms.config`), une
 * seule entrée buzzers et un seul contrôleur de lumières pour toute la page.
 *
 * Tant que la config de salle n'est pas servie par le backoffice, elle est gardée
 * dans le navigateur du PC de la salle.
 */
export const HARDWARE_STORAGE_KEY = 'quizzup_room_hardware'

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

async function createLighting(options: { emergencyReason?: string | null } = {}) {
  const controller = createLightingController({
    config: parsed.value.config.lighting,
    output: createSimulationOutput(),
    resolveDesk,
  })
  // Un arrêt d'urgence en cours survit au redémarrage (noir avant la première trame).
  if (options.emergencyReason) {
    controller.emergencyStop(options.emergencyReason)
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
  await controller?.stop()
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
    const controller = await createLighting({ emergencyReason })
    controller.smoke.disarm()
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
 * Enregistre la config de salle (normalisée) et l'applique : nouveau mapping des
 * buzzers, et contrôleur de lumières relancé seulement si la partie lumières a changé.
 */
export async function saveRoomHardwareConfig(input: unknown): Promise<ParsedRoomHardwareConfig> {
  const previousLighting = JSON.stringify(parsed.value.config.lighting)
  const next = parseRoomHardwareConfig(input)
  parsed.value = next

  try {
    getStorage()?.setItem(HARDWARE_STORAGE_KEY, JSON.stringify(next.config))
  } catch {
    // Stockage indisponible : la config vaut jusqu'au rechargement.
  }

  keyboardInput?.setKeymap(effectiveKeymap(next.config))

  if (JSON.stringify(next.config.lighting) !== previousLighting) {
    await restartLighting()
  }
  return next
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
  }
}
