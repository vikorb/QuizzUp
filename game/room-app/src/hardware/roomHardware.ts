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
let lightingStarting: Promise<LightingController> | null = null
let stopLightingState: (() => void) | null = null
let stopLightingEvents: (() => void) | null = null
const lightingState = shallowRef<LightingState | null>(null)
const lightingRef = shallowRef<LightingController | null>(null)

/** Le moteur numérote les participants comme les pupitres (cf. `toEngineParticipants`). */
function resolveDesk(participantId: number) {
  return isDesk(participantId) ? participantId : null
}

async function reconnectGrantedPort(controller: LightingController): Promise<void> {
  const { driver } = parsed.value.config.lighting
  if (driver === 'simulation' || !isWebSerialSupported()) {
    return
  }
  const port = await getGrantedDmxPort().catch(() => null)
  if (port && controller === lighting) {
    await controller.setOutput(createSerialOutput({ port, driver }))
  }
}

async function createLighting(): Promise<LightingController> {
  const controller = createLightingController({
    config: parsed.value.config.lighting,
    output: createSimulationOutput(),
    resolveDesk,
  })
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

/** Démarre (une seule fois) le contrôleur de lumières de la page. */
export async function startLighting(): Promise<LightingController> {
  if (lighting) {
    return lighting
  }
  lightingStarting ??= createLighting().finally(() => {
    lightingStarting = null
  })
  return lightingStarting
}

export function getLighting(): LightingController | null {
  return lighting
}

/** Arrête les lumières (noir, fumée coupée) et libère l'interface DMX. */
export async function stopLighting(): Promise<void> {
  await lightingStarting?.catch(() => undefined)
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

/**
 * Bouton « Connecter l'interface DMX » : doit être appelé dans un clic (le
 * navigateur demande quelle interface USB utiliser).
 */
export async function connectDmxInterface(): Promise<void> {
  const { driver } = parsed.value.config.lighting
  if (driver === 'simulation') {
    throw new Error('simulation_driver')
  }
  const controller = await startLighting()
  const port = await requestDmxPort()
  await controller.setOutput(createSerialOutput({ port, driver }))
}

/** Revient à la salle simulée (débranchement volontaire de l'interface). */
export async function switchToSimulatedLights(
  output: DmxOutput = createSimulationOutput()
): Promise<void> {
  await lighting?.setOutput(output)
}

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * Enregistre la config de salle (normalisée) et l'applique : nouveau mapping des
 * buzzers, contrôleur de lumières relancé s'il tournait.
 */
export async function saveRoomHardwareConfig(input: unknown): Promise<ParsedRoomHardwareConfig> {
  const next = parseRoomHardwareConfig(input)
  parsed.value = next

  try {
    getStorage()?.setItem(HARDWARE_STORAGE_KEY, JSON.stringify(next.config))
  } catch {
    // Stockage indisponible : la config vaut jusqu'au rechargement.
  }

  keyboardInput?.setKeymap(effectiveKeymap(next.config))

  if (lighting || lightingStarting) {
    await stopLighting()
    await startLighting()
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
