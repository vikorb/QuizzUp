import type { PortAddress } from './artnet.js'
import { DMX_CHANNELS, encodeArtDmx, nextSequence } from './artnet.js'
import type { Clock, TimerHandle } from './clock.js'
import { systemClock } from './clock.js'
import type { OutputPlan } from './mapping.js'
import { renderOutput } from './mapping.js'

/**
 * Silence du navigateur au-delà duquel le pont envoie du noir (onglet planté, PC gelé). Chrome
 * bride les minuteurs d'un onglet masqué à environ 1 Hz : avec 1000 ms, l'éclairage clignoterait
 * dès que l'opérateur change d'onglet. 2500 ms laisse passer deux réveils bridés.
 */
export const SILENCE_TIMEOUT_MS = 2500
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
  /** Une trame de l'écran de salle : 512 canaux d'un univers interne (0-15, 0 par défaut). */
  frame: (data: Uint8Array, universe?: number) => void
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

/** Dernier état reçu pour un univers interne. */
type Source = {
  data: Uint8Array
  frameAt: number
  sentAt: number
  dirty: boolean
  /** Plus de trame depuis `silenceTimeoutMs` alors que d'autres univers arrivent : il reste à zéro. */
  stale: boolean
}

/**
 * Cœur du pont, sans réseau : reçoit les trames (une par univers interne), les convertit en
 * paquets ArtDMX (un par univers de sortie, chacun avec sa séquence), et applique le **chien de
 * garde** : silence ou coupure → noir sur tous les univers ; dernière trame renvoyée à plus de
 * 1 Hz. Seuls les univers internes réellement reçus (et le 0) sont émis : jamais de zéros sur un
 * univers Art-Net que l'écran de salle ne pilote pas.
 */
export function createBridgeCore(options: BridgeCoreOptions): BridgeCore {
  const clock = options.clock ?? systemClock
  const silenceTimeoutMs = options.silenceTimeoutMs ?? SILENCE_TIMEOUT_MS
  const blackoutMs = options.blackoutMs ?? BLACKOUT_MS
  const log = options.log ?? (() => undefined)
  const { plan } = options
  const sequences = new Map<number, number>()
  const zeros = new Uint8Array(DMX_CHANNELS)
  const newSource = (stale = false): Source => ({
    data: zeros,
    frameAt: 0,
    sentAt: Number.NEGATIVE_INFINITY,
    dirty: false,
    stale,
  })
  /** L'univers 0 est toujours émis (comme avant les univers multiples), les autres à leur arrivée. */
  const sources = new Map<number, Source>([[0, newSource(true)]])

  let mode: BridgeMode = 'waiting'
  let timer: TimerHandle | null = null
  let lastSentAt = Number.NEGATIVE_INFINITY
  let blackoutUntil = 0
  let framesReceived = 0
  let packetsSent = 0
  let blackouts = 0

  /** Envoie les univers de sortie alimentés par l'univers interne `universe`. */
  const sendSource = (universe: number, data: Uint8Array) => {
    for (const output of plan.outputs) {
      if (output.source !== universe) {
        continue
      }
      const sequence = nextSequence(sequences.get(output.key) ?? 0)
      sequences.set(output.key, sequence)
      options.transmit(
        encodeArtDmx({ sequence, address: output.address, data: renderOutput(output, data) }),
        output.address
      )
      packetsSent += 1
    }
  }

  /** Du noir sur chaque univers émis (les données mémorisées ne sont pas touchées). */
  const sendZeros = () => {
    for (const [universe, source] of sources) {
      sendSource(universe, zeros)
      source.sentAt = clock.now()
    }
    lastSentAt = clock.now()
  }

  const startBlackout = (reason: BlackoutReason) => {
    const wasBlackout = mode === 'blackout'
    mode = 'blackout'
    blackoutUntil = clock.now() + blackoutMs
    for (const source of sources.values()) {
      source.data = zeros
      source.dirty = false
    }
    if (!wasBlackout) {
      blackouts += 1
      log(
        `Chien de garde : ${REASONS[reason]} → noir sur tous les univers pendant ${blackoutMs} ms`
      )
    }
    sendZeros()
  }

  const tick = () => {
    const now = clock.now()
    if (mode === 'live') {
      const isSilent = (source: Source) => now - source.frameAt > silenceTimeoutMs
      if ([...sources.values()].every((source) => source.stale || isSilent(source))) {
        startBlackout('silence')
        return
      }
      for (const [universe, source] of sources) {
        if (!source.stale && isSilent(source)) {
          // Un univers se tait pendant que les autres continuent : il passe à zéro, pas figé.
          log(`Univers interne ${universe} : plus de trame, remis à zéro`)
          source.stale = true
          source.data = zeros
          source.dirty = true
        }
        if (
          (source.dirty && now - source.sentAt >= MIN_INTERVAL_MS) ||
          now - source.sentAt >= KEEPALIVE_MS
        ) {
          source.dirty = false
          sendSource(universe, source.data)
          source.sentAt = now
        }
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
        sendZeros()
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
      for (const source of sources.values()) {
        source.data = zeros
        source.dirty = false
      }
      log('Arrêt du pont : noir sur tous les univers')
      sendZeros()
    },
    frame(data, universe = 0) {
      const now = clock.now()
      if (mode !== 'live') {
        log('Trames reçues du navigateur : envoi Art-Net en cours')
      }
      mode = 'live'
      framesReceived += 1
      let source = sources.get(universe)
      if (!source) {
        source = newSource()
        sources.set(universe, source)
        if (!plan.outputs.some((output) => output.source === universe)) {
          log(`Univers interne ${universe} reçu mais non mappé (voir --map) : ignoré`)
        }
      }
      source.frameAt = now
      source.stale = false
      source.data = data.slice(0, DMX_CHANNELS)
      source.dirty = true
      if (now - source.sentAt >= MIN_INTERVAL_MS) {
        source.dirty = false
        sendSource(universe, source.data)
        source.sentAt = now
      }
    },
    clientDisconnected() {
      if (mode !== 'waiting') {
        startBlackout('disconnected')
      }
    },
    sendBlackout: sendZeros,
    getStatus: () => ({ mode, framesReceived, packetsSent, blackouts }),
  }
}
