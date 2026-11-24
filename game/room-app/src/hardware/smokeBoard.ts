import {
  createSmokeBoardLink,
  FirmwareError,
  type FirmwareErrorCode,
  type FirmwareProgress,
  getWebSerial,
  installFirmware,
  IntelHexError,
  isWebSerialSupported,
  portUsbId,
  restoreFirmware,
  type SerialPortLike,
  type SmokeBoardLink,
  type SmokeBoardPort,
  type SmokeBoardState,
  writeIntelHex,
} from '@quizzup/hardware'
import { computed, shallowRef } from 'vue'

import bundledHex from '../../../hardware/firmware/fumee/fumee.hex?raw'
import {
  getDmxPort,
  getLighting,
  getRoomHardwareConfig,
  saveRoomHardwareConfig,
  setSmokeBoardLink,
  startLighting,
} from './roomHardware'

/**
 * Carte USB de la machine à fumée (Arduino Uno programmé pour QuizzUp) : choix du port, lien, reprise
 * au rebranchement, installation du programme. Voir `docs/cadrage/conception-fumee-carte-usb.md`.
 *
 * Rien ici n'envoie de commande de fumée : le lien vit dans le contrôleur de lumières
 * (`setSmokeBoardLink`), dont toutes les gardes s'appliquent. Ce module coupe le lien avant toute
 * installation et le rouvre ensuite, fumée désarmée.
 */

/** Version du programme livré avec l'écran de salle (`FUMEE_VERSION`, `fumee_logic.h`). */
export const BUNDLED_PROGRAM_VERSION = '1.0.0'
/** Arduino (2341, 2A03) et CH340 (1A86) : les puces des cartes Uno et de leurs clones. */
export const SMOKE_BOARD_USB_VENDOR_IDS = [0x2341, 0x2a03, 0x1a86] as const
/** Un seul fichier, sans date : il est écrasé par le suivant dans le dossier de téléchargement. */
export const BACKUP_FILE_NAME = 'quizzup-fumee-sauvegarde-carte.hex'

export type BoardView =
  'none' | 'connecting' | 'ready' | 'outdated' | 'absent' | 'silent' | 'disconnected' | 'fault'

export type InstallErrorCode =
  FirmwareErrorCode | 'not_confirmed' | 'no_port' | 'invalid_hex' | 'busy'

export type InstallState =
  | { phase: 'idle' }
  | { phase: 'running'; step: FirmwareProgress['step']; done: number; total: number }
  | { phase: 'done'; kind: 'install' | 'restore' }
  | { phase: 'error'; code: InstallErrorCode; inert: boolean | null }

export type ConnectResult = 'ready' | 'cancelled' | 'same_as_dmx' | 'failed' | 'unsupported'

export type DownloadFile = (name: string, text: string) => void

let link: SmokeBoardLink | null = null
/** Dernier port choisi ou repris : la cible de l'installation, même si la carte n'a pas répondu. */
let port: SmokeBoardPort | null = null
let stopLink: (() => void) | null = null
let stopConnectWatch: (() => void) | null = null
const linkState = shallowRef<SmokeBoardState | null>(null)
const installState = shallowRef<InstallState>({ phase: 'idle' })
/** Plusieurs ports du modèle retenu : aucun n'est ouvert tant que l'un n'est pas débranché. */
const ambiguous = shallowRef(false)
/** Ouvertures et installations passent l'une après l'autre. */
let queue: Promise<unknown> = Promise.resolve()

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

function viewOf(state: SmokeBoardState | null): BoardView {
  if (!state) {
    return 'none'
  }
  switch (state.status) {
    case 'idle':
    case 'closed':
      return 'none'
    case 'connecting':
      return 'connecting'
    case 'ready':
      return state.version === BUNDLED_PROGRAM_VERSION ? 'ready' : 'outdated'
    case 'no_firmware':
      return 'absent'
    default:
      return state.status
  }
}

/** Ferme le lien en place (un `0` part) : plus aucune commande ne passe, le contrôleur le voit. */
async function detach(): Promise<void> {
  stopLink?.()
  stopLink = null
  const previous = link
  link = null
  await previous?.close()
}

async function attach(next: SmokeBoardPort): Promise<SmokeBoardState['status']> {
  // Le contrôleur existe avant le lien : `setSmokeLink` coupe, désarme, puis suit la carte.
  await startLighting()
  await detach()
  const created = createSmokeBoardLink({ port: next })
  link = created
  port = next
  linkState.value = created.getState()
  stopLink = created.onChange((state) => {
    if (link === created) {
      linkState.value = state
    }
  })
  setSmokeBoardLink(created)
  return created.open()
}

/**
 * Retient le modèle USB de la carte (`lighting.smoke.board`) pour la retrouver après un
 * rechargement. Jamais l'interface DMX de la salle : même objet ou même modèle, rien n'est écrit.
 */
async function rememberBoard(next: SerialPortLike): Promise<boolean> {
  const usb = portUsbId(next)
  const config = getRoomHardwareConfig()
  if (!usb) {
    // Le navigateur ne donne pas d'identité : rien à retenir, la carte se rechoisira au rechargement.
    return true
  }
  if (getDmxPort() === next) {
    return false
  }
  const dmx = config.lighting.usb
  if (dmx?.usbVendorId === usb.usbVendorId && dmx.usbProductId === usb.usbProductId) {
    return false
  }
  const { board } = config.lighting.smoke
  if (board?.usbVendorId !== usb.usbVendorId || board.usbProductId !== usb.usbProductId) {
    await saveRoomHardwareConfig({
      ...config,
      lighting: {
        ...config.lighting,
        smoke: { ...config.lighting.smoke, board: { kind: 'uno-serial', ...usb } },
      },
    })
  }
  return true
}

function matchesBoard(candidate: SerialPortLike): boolean {
  const { board } = getRoomHardwareConfig().lighting.smoke
  const usb = portUsbId(candidate)
  return (
    board !== undefined &&
    usb !== null &&
    usb.usbVendorId === board.usbVendorId &&
    usb.usbProductId === board.usbProductId
  )
}

/**
 * « Choisir la carte de la fumée » : à appeler dans un clic (le navigateur demande quel port
 * utiliser). La carte n'est retenue dans la config que si elle répond par la bannière du programme.
 */
export async function connectSmokeBoard(): Promise<ConnectResult> {
  const serial = getWebSerial()
  if (!serial) {
    return 'unsupported'
  }
  // La fenêtre de choix doit s'ouvrir dans le clic, avant toute autre attente.
  let chosen: SerialPortLike
  try {
    chosen = await serial.requestPort({
      filters: SMOKE_BOARD_USB_VENDOR_IDS.map((usbVendorId) => ({ usbVendorId })),
    })
  } catch {
    return 'cancelled'
  }
  return serialize(async () => {
    const dmx = getRoomHardwareConfig().lighting.usb
    const usb = portUsbId(chosen)
    if (
      getDmxPort() === chosen ||
      (dmx && usb && dmx.usbVendorId === usb.usbVendorId && dmx.usbProductId === usb.usbProductId)
    ) {
      return 'same_as_dmx'
    }
    ambiguous.value = false
    const status = await attach(chosen as SmokeBoardPort)
    if (status !== 'ready') {
      return 'failed'
    }
    return (await rememberBoard(chosen)) ? 'ready' : 'same_as_dmx'
  })
}

/** Port déjà autorisé du modèle retenu : un seul, sinon aucun (voir `ambiguous`). */
async function findGrantedBoard(): Promise<SmokeBoardPort | null> {
  const granted = ((await getWebSerial()?.getPorts()) ?? []).filter(matchesBoard)
  ambiguous.value = granted.length > 1
  return granted.length === 1 ? (granted[0] as SmokeBoardPort) : null
}

const isLive = () => {
  const status = link?.getState().status
  return status === 'ready' || status === 'connecting'
}

/**
 * Reprise sans clic : au démarrage et au rebranchement de la carte. Elle repart toujours désarmée
 * (`setSmokeBoardLink`). Une carte retenue dont la bannière n'arrive pas reste « programme absent ».
 */
export async function reconnectSmokeBoard(): Promise<void> {
  watchConnection()
  if (!isWebSerialSupported() || installState.value.phase === 'running') {
    return
  }
  await serialize(async () => {
    if (isLive() || installState.value.phase === 'running') {
      return
    }
    const found = await findGrantedBoard()
    if (found) {
      await attach(found)
    }
  })
}

function onConnect(event: Event): void {
  const target = event.target as unknown as SerialPortLike | null
  if (target && matchesBoard(target)) {
    void reconnectSmokeBoard().catch(() => undefined)
  }
}

function watchConnection(): void {
  const serial = getWebSerial()
  if (stopConnectWatch || !serial?.addEventListener) {
    return
  }
  serial.addEventListener('connect', onConnect)
  stopConnectWatch = () => {
    serial.removeEventListener?.('connect', onConnect)
    stopConnectWatch = null
  }
}

/** Texte `.hex` téléchargé par le navigateur. */
export const downloadFile: DownloadFile = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function failure(error: unknown): InstallState {
  if (error instanceof FirmwareError) {
    return { phase: 'error', code: error.code, inert: error.inert ?? null }
  }
  if (error instanceof IntelHexError) {
    return { phase: 'error', code: 'invalid_hex', inert: null }
  }
  return { phase: 'error', code: 'port_lost', inert: null }
}

/**
 * Installation ou restauration. Avant d'ouvrir le chargeur : fumée désarmée et jet coupé, lien
 * fermé (aucune commande de fumée ne part pendant toute l'opération). Ensuite la carte est rouverte
 * par un nouveau lien, donc désarmée.
 */
async function flash(
  kind: 'install' | 'restore',
  task: (target: SmokeBoardPort, onProgress: (progress: FirmwareProgress) => void) => Promise<void>
): Promise<void> {
  if (installState.value.phase === 'running') {
    installState.value = { phase: 'error', code: 'busy', inert: null }
    return
  }
  const target = port
  if (!target) {
    installState.value = { phase: 'error', code: 'no_port', inert: null }
    return
  }
  installState.value = { phase: 'running', step: 'sync', done: 0, total: 1 }
  await serialize(async () => {
    const lighting = getLighting()
    lighting?.smoke.stop()
    lighting?.smoke.disarm()
    try {
      await detach()
      await task(target, (progress) => {
        installState.value = { phase: 'running', ...progress }
      })
    } catch (error) {
      installState.value = failure(error)
      return
    }
    installState.value = { phase: 'done', kind }
    try {
      if ((await attach(target)) === 'ready') {
        await rememberBoard(target)
      }
    } catch {
      // Installation faite ; la carte se reprendra au rebranchement ou par « Choisir la carte ».
    }
  })
}

/**
 * Installe le programme livré. `machineOff` : l'opérateur a confirmé que la machine à fumée est
 * éteinte (l'ancien programme la déclenche seul dès que la carte est sous tension).
 */
export async function installSmokeBoardProgram(options: {
  machineOff: boolean
  download?: DownloadFile
  hex?: string
}): Promise<void> {
  if (!options.machineOff) {
    installState.value = { phase: 'error', code: 'not_confirmed', inert: null }
    return
  }
  const download = options.download ?? downloadFile
  await flash('install', (target, onProgress) =>
    installFirmware({
      port: target,
      hex: options.hex ?? bundledHex,
      onProgress,
      // La sauvegarde du programme d'origine est le retour arrière : rien n'est écrit sans elle.
      onBackup: (backup) => download(BACKUP_FILE_NAME, writeIntelHex(backup)),
    })
  )
}

/** Réécrit un `.hex` choisi (en pratique la sauvegarde téléchargée avant l'installation). */
export async function restoreSmokeBoardProgram(options: {
  machineOff: boolean
  hex: string
}): Promise<void> {
  if (!options.machineOff) {
    installState.value = { phase: 'error', code: 'not_confirmed', inert: null }
    return
  }
  await flash('restore', (target, onProgress) =>
    restoreFirmware({ port: target, hex: options.hex, onProgress })
  )
}

export function dismissInstallResult(): void {
  if (installState.value.phase !== 'running') {
    installState.value = { phase: 'idle' }
  }
}

/** Remet le module à zéro (tests, changement de salle). */
export async function resetSmokeBoard(): Promise<void> {
  stopConnectWatch?.()
  await detach()
  port = null
  linkState.value = null
  installState.value = { phase: 'idle' }
  ambiguous.value = false
  queue = Promise.resolve()
}

export function useSmokeBoard() {
  return {
    supported: isWebSerialSupported(),
    state: computed(() => linkState.value),
    view: computed(() => viewOf(linkState.value)),
    install: computed(() => installState.value),
    busy: computed(() => installState.value.phase === 'running'),
    ambiguous: computed(() => ambiguous.value),
    /** Un port a été choisi ou repris : l'installation a une cible. */
    hasPort: computed(() => linkState.value !== null),
  }
}
