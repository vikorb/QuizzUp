import type { PortAddress } from './artnet.js'
import { DMX_CHANNELS, encodeArtDmx, nextSequence } from './artnet.js'
import type { Clock, TimerHandle } from './clock.js'
import { systemClock } from './clock.js'
import type { OutputPlan } from './mapping.js'
import { renderOutputs } from './mapping.js'

/** Silence du navigateur au-delà duquel le pont envoie du noir (onglet planté, PC gelé). */
export const SILENCE_TIMEOUT_MS = 1000
/** Durée pendant laquelle les trames à zéro sont répétées après une coupure. */
export const BLACKOUT_MS = 3000
/** Cadence des trames à zéro pendant cette période (10 Hz). */
export const BLACKOUT_INTERVAL_MS = 100
/** La dernière trame est renvoyée au moins toutes les 800 ms (> 1 Hz) pour garder les nœuds. */
export const KEEPALIVE_MS = 800
/** Pas plus de ~44 trames/s par univers (recommandation Art-Net). */
export const MIN_INTERVAL_MS = 22
/** Pas de la boucle interne. */
export const TICK_MS = 25

export const SILENCE_LIMITS = { min: 200, max: 10_000 } as const
export const BLACKOUT_LIMITS = { min: 500, max: 60_000 } as const

/**
 * - `waiting` : rien à envoyer (aucun navigateur, ou coupure terminée).
 * - `live` : le navigateur envoie des trames, elles partent en Art-Net.
 * - `blackout` : coupure ou silence, des trames à zéro sont répétées pendant `blackoutMs`.
 */
export type BridgeMode = 'waiting' | 'live' | 'blackout'

export type BlackoutReason = 'silence' | 'disconnected'

export type BridgeStatus = {
  mode: BridgeMode
  framesReceived: number
  packetsSent: number
  blackouts: number
}

export type BridgeCoreOptions = {
  plan: OutputPlan
  /** Envoie un paquet ArtDMX déjà encodé (UDP). */
  transmit: (packet: Buffer, address: PortAddress) => void
  clock?: Clock
  silenceTimeoutMs?: number
  blackoutMs?: number
  log?: (message: string) => void
}

export type BridgeCore = {
  start: () => void
  /** Arrête la boucle et envoie immédiatement une trame à zéro sur chaque univers. */
  stop: () => void
  /** Une trame de l'écran de salle (512 canaux de l'univers interne). */
  frame: (data: Uint8Array) => void
  /** Le navigateur s'est déconnecté : trames à zéro pendant `blackoutMs`. */
  clientDisconnected: () => void
  /** Envoie tout de suite une trame à zéro sur chaque univers de sortie. */
  sendBlackout: () => void
  getStatus: () => BridgeStatus
}

const REASONS: Record<BlackoutReason, string> = {
  silence: 'plus aucune trame du navigateur',
  disconnected: 'navigateur déconnecté',
}

/**
 * Cœur du pont, sans réseau : reçoit les trames, les convertit en paquets ArtDMX (un par
 * univers de sortie, chacun avec sa séquence), et applique le **chien de garde** :
 * silence ou coupure → noir sur tous les univers ; dernière trame renvoyée à plus de 1 Hz.
 */
export function createBridgeCore(options: BridgeCoreOptions): BridgeCore {
  const clock = options.clock ?? systemClock
  const silenceTimeoutMs = options.silenceTimeoutMs ?? SILENCE_TIMEOUT_MS
  const blackoutMs = options.blackoutMs ?? BLACKOUT_MS
  const log = options.log ?? (() => undefined)
  const { plan } = options
  const sequences = plan.outputs.map(() => 0)
  const zeros = new Uint8Array(DMX_CHANNELS)

  let mode: BridgeMode = 'waiting'
  let timer: TimerHandle | null = null
  let last: Uint8Array = zeros
  let dirty = false
  let lastFrameAt = 0
  let lastSentAt = Number.NEGATIVE_INFINITY
  let blackoutUntil = 0
  let framesReceived = 0
  let packetsSent = 0
  let blackouts = 0

  const sendUniverse = (internal: Uint8Array) => {
    const outputs = renderOutputs(plan, internal)
    plan.outputs.forEach((output, index) => {
      sequences[index] = nextSequence(sequences[index]!)
      options.transmit(
        encodeArtDmx({
          sequence: sequences[index]!,
          address: output.address,
          data: outputs[index]!,
        }),
        output.address
      )
      packetsSent += 1
    })
    lastSentAt = clock.now()
  }

  const startBlackout = (reason: BlackoutReason) => {
    const wasBlackout = mode === 'blackout'
    mode = 'blackout'
    blackoutUntil = clock.now() + blackoutMs
    last = zeros
    dirty = false
    if (!wasBlackout) {
      blackouts += 1
      log(
        `Chien de garde : ${REASONS[reason]} → noir sur tous les univers pendant ${blackoutMs} ms`
      )
    }
    sendUniverse(zeros)
  }

  const tick = () => {
    const now = clock.now()
    if (mode === 'live') {
      if (now - lastFrameAt > silenceTimeoutMs) {
        startBlackout('silence')
        return
      }
      if ((dirty && now - lastSentAt >= MIN_INTERVAL_MS) || now - lastSentAt >= KEEPALIVE_MS) {
        dirty = false
        sendUniverse(last)
      }
      return
    }
    if (mode === 'blackout') {
      if (now >= blackoutUntil) {
        mode = 'waiting'
        log('Chien de garde : fin des trames à zéro, en attente du navigateur')
        return
      }
      if (now - lastSentAt >= BLACKOUT_INTERVAL_MS) {
        sendUniverse(zeros)
      }
    }
  }

  return {
    start() {
      if (timer === null) {
        timer = clock.setInterval(tick, TICK_MS)
      }
    },
    stop() {
      if (timer !== null) {
        clock.clearInterval(timer)
        timer = null
      }
      mode = 'waiting'
      last = zeros
      dirty = false
      log('Arrêt du pont : noir sur tous les univers')
      sendUniverse(zeros)
    },
    frame(data) {
      const now = clock.now()
      if (mode !== 'live') {
        log('Trames reçues du navigateur : envoi Art-Net en cours')
      }
      mode = 'live'
      framesReceived += 1
      lastFrameAt = now
      last = data.slice(0, DMX_CHANNELS)
      dirty = true
      if (now - lastSentAt >= MIN_INTERVAL_MS) {
        dirty = false
        sendUniverse(last)
      }
    },
    clientDisconnected() {
      if (mode !== 'waiting') {
        startBlackout('disconnected')
      }
    },
    sendBlackout: () => sendUniverse(zeros),
    getStatus: () => ({ mode, framesReceived, packetsSent, blackouts }),
  }
}
