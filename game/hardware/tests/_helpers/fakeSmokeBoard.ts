import { WATCHDOG_STALL_MS } from '@hardware/lighting/lightingController'
import { SMOKE_HARD_LIMITS } from '@hardware/lighting/smoke'
import type { SmokeBoardPort } from '@hardware/smoke/boardLink'
import type { BoardCause, BoardOutputState } from '@hardware/smoke/boardProtocol'

import type { ManualClock } from './manualClock'

export const FAKE_BOARD_VERSION = '1.0.0'
/** Bannière d'une carte conforme : plafond, pause et bail égaux aux limites du projet. */
export const FAKE_BOARD_BANNER = [
  'QZF READY 1',
  FAKE_BOARD_VERSION,
  SMOKE_HARD_LIMITS.maxDurationMs,
  SMOKE_HARD_LIMITS.minCooldownMs,
  WATCHDOG_STALL_MS,
].join(' ')

export type FakeSmokeBoardOptions = {
  clock: ManualClock
  /** Bannière envoyée à chaque ouverture du port ; `null` : une carte sans notre programme. */
  banner?: string | null
  /** Texte glissé juste avant la bannière, sur la même ligne (parasites de remise à zéro). */
  noise?: string
  /** Délai entre l'ouverture du port et la bannière (le chargeur attend environ une seconde). */
  bannerDelayMs?: number
  /** Carte qui n'écrit jamais de ligne d'état. */
  mute?: boolean
}

export type FakeBoardSnapshot = {
  output: boolean
  state: BoardOutputState
  cause: BoardCause
  /** Instant de la dernière coupure d'un jet, `null` s'il n'y en a pas eu. */
  lastCutAt: number | null
}

const LEASE_MS = WATCHDOG_STALL_MS
const MAX_FIRE_MS = SMOKE_HARD_LIMITS.maxDurationMs
const COOLDOWN_MS = SMOKE_HARD_LIMITS.minCooldownMs

const domError = (name: string, message: string) => Object.assign(new Error(message), { name })
const bytes = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0))

/**
 * Fausse carte de fumée sur un faux port série, pilotée par l'horloge simulée. Applique les
 * règles du §3 de la conception : bail de 500 ms, plafond de 10 s, pause de 5 s, seule la ligne
 * exacte `F` allume, `H` est neutre, toute autre ligne coupe. Une ligne d'état part après chaque
 * ligne reçue. Après une remise à zéro la carte est en pause (`COOL`, cause `CMD`) pendant 5 s ;
 * un `F` reçu en pause est refusé et verrouille la carte : les `F` suivants sont ignorés
 * jusqu'à un `0` ou 500 ms sans `F`. La cause ne change que lorsqu'un jet est vraiment coupé. Ouvrir le port la remet à zéro (comme le signal DTR d'un Uno) et lui fait
 * envoyer la bannière.
 */
export function createFakeSmokeBoard(options: FakeSmokeBoardOptions) {
  const { clock } = options
  const banner = options.banner === undefined ? FAKE_BOARD_BANNER : options.banner
  let mute = options.mute ?? false

  /** Lignes reçues par la carte, avec l'instant de réception. */
  const received: { line: string; at: number }[] = []
  let unplugged = false
  let writesStalled = false
  let writesFailing = false
  let isOpen = false
  let readerLocked = false
  let writerLocked = false
  let closeCount = 0
  let bannerTimer: ReturnType<typeof clock.setTimeout> | undefined

  // Programme de la carte.
  let jetStart: number | null = null
  let lastFireAt = 0
  let lastCutAt: number | null = null
  /** Fin de la pause en cours (au démarrage comme après un jet). */
  let coolUntil = 0
  /** Un `F` refusé en pause pose ce verrou : les `F` suivants sont ignorés. */
  let locked = false
  let lastFReceivedAt = Number.NEGATIVE_INFINITY
  let cause: BoardCause = 'CMD'

  // Flux vers la page.
  const queue: Uint8Array[] = []
  let waiting: {
    resolve: (result: { done: boolean; value?: Uint8Array }) => void
    reject: (error: Error) => void
  } | null = null
  let cancelled = false
  let inbound = ''

  const emit = (text: string) => {
    const chunk = bytes(text)
    if (waiting) {
      const pending = waiting
      waiting = null
      pending.resolve({ done: false, value: chunk })
    } else {
      queue.push(chunk)
    }
  }

  /** Applique ce que le temps a changé (fin de bail, plafond) : coupe pile à l'échéance. */
  const settle = (now: number) => {
    if (jetStart === null) {
      return
    }
    const leaseEnd = lastFireAt + LEASE_MS
    const maxEnd = jetStart + MAX_FIRE_MS
    const end = Math.min(leaseEnd, maxEnd)
    if (now >= end) {
      lastCutAt = end
      coolUntil = end + COOLDOWN_MS
      cause = maxEnd <= leaseEnd ? 'MAX' : 'LEASE'
      jetStart = null
    }
  }

  const snapshot = (): FakeBoardSnapshot => {
    const now = clock.now()
    settle(now)
    let state: BoardOutputState = 'READY'
    if (jetStart !== null) {
      state = 'FIRE'
    } else if (now < coolUntil) {
      state = 'COOL'
    }
    return { output: jetStart !== null, state, cause, lastCutAt }
  }

  const cut = (now: number, reason: BoardCause) => {
    if (jetStart !== null) {
      lastCutAt = now
      coolUntil = now + COOLDOWN_MS
      jetStart = null
      cause = reason
    }
  }

  const handleLine = (line: string) => {
    const now = clock.now()
    settle(now)
    if (line === 'F') {
      // Verrou levé par 500 ms sans `F` (ou par un `0`).
      if (locked && now - lastFReceivedAt >= LEASE_MS) {
        locked = false
      }
      lastFReceivedAt = now
      if (locked) {
        // Ignoré.
      } else if (jetStart !== null) {
        lastFireAt = now
      } else if (now < coolUntil) {
        locked = true
      } else {
        jetStart = now
        lastFireAt = now
      }
    } else if (line === '0') {
      locked = false
      cut(now, 'CMD')
    } else if (line !== 'H') {
      cut(now, 'BAD')
    }
    if (!mute) {
      const { output, state, cause: current } = snapshot()
      emit(`S ${output ? 1 : 0} ${state} ${current}\n`)
    }
  }

  const receive = (chunk: Uint8Array) => {
    inbound += String.fromCharCode(...chunk)
    let newline = inbound.indexOf('\n')
    while (newline >= 0) {
      const line = inbound.slice(0, newline)
      inbound = inbound.slice(newline + 1)
      received.push({ line, at: clock.now() })
      handleLine(line)
      newline = inbound.indexOf('\n')
    }
  }

  /** Remise à zéro (ouverture du port) : programme au repos, bannière après le délai du chargeur. */
  const reset = () => {
    jetStart = null
    lastFireAt = 0
    lastCutAt = null
    // Une carte qui démarre est en pause 5 s : pas de jet juste après une remise à zéro.
    coolUntil = clock.now() + COOLDOWN_MS
    locked = false
    lastFReceivedAt = Number.NEGATIVE_INFINITY
    cause = 'CMD'
    inbound = ''
    queue.length = 0
    cancelled = false
    waiting = null
    if (banner !== null) {
      bannerTimer = clock.setTimeout(
        () => emit(`${options.noise ?? ''}${banner}\n`),
        options.bannerDelayMs ?? 1000
      )
    }
  }

  const readable = {
    getReader: () => {
      if (readerLocked) {
        throw new TypeError('ReadableStream is locked')
      }
      readerLocked = true
      return {
        read: () =>
          new Promise<{ done: boolean; value?: Uint8Array }>((resolve, reject) => {
            const next = queue.shift()
            if (unplugged) {
              reject(domError('NetworkError', 'The device has been lost.'))
            } else if (next) {
              resolve({ done: false, value: next })
            } else if (cancelled) {
              resolve({ done: true })
            } else {
              waiting = { resolve, reject }
            }
          }),
        cancel: async () => {
          cancelled = true
          waiting?.resolve({ done: true })
          waiting = null
        },
        releaseLock: () => {
          readerLocked = false
        },
      }
    },
  } as unknown as ReadableStream<Uint8Array>

  const writable = {
    getWriter: () => {
      if (writerLocked) {
        throw new TypeError('WritableStream is locked')
      }
      writerLocked = true
      return {
        write: async (chunk: Uint8Array) => {
          if (unplugged || writesFailing) {
            throw domError('NetworkError', 'The device has been lost.')
          }
          if (writesStalled) {
            await new Promise<never>(() => undefined)
          }
          receive(chunk)
        },
        abort: async () => undefined,
        releaseLock: () => {
          writerLocked = false
        },
      }
    },
    abort: async () => undefined,
  } as unknown as WritableStream<Uint8Array>

  const port = {
    openedWith: null as unknown,
    async open(openOptions: unknown) {
      if (isOpen) {
        throw domError('InvalidStateError', 'The port is already open.')
      }
      isOpen = true
      port.openedWith = openOptions
      reset()
    },
    async close() {
      if (readerLocked || writerLocked) {
        throw new TypeError('Cannot cancel a locked stream')
      }
      isOpen = false
      closeCount += 1
      if (bannerTimer !== undefined) {
        clock.clearTimeout(bannerTimer)
      }
    },
    get readable() {
      return isOpen ? readable : null
    },
    get writable() {
      return isOpen ? writable : null
    },
  }

  return {
    port: port as unknown as SmokeBoardPort & { openedWith: unknown },
    /** État de la carte à l'instant de l'horloge (sortie, état, cause, dernière coupure). */
    snapshot,
    /** Lignes reçues par la carte. */
    received,
    /** Texte tel qu'envoyé par la carte (ligne parasite, état forgé, bannière en cours de partie). */
    inject: emit,
    mute: (value: boolean) => {
      mute = value
    },
    /** Câble débranché : lectures et écritures échouent. */
    unplug: () => {
      unplugged = true
      waiting?.reject(domError('NetworkError', 'The device has been lost.'))
      waiting = null
    },
    /** Le flux de lecture se termine sans erreur (le navigateur a fermé le port). */
    endStream: () => {
      cancelled = true
      waiting?.resolve({ done: true })
      waiting = null
    },
    /** Les écritures échouent, la lecture continue. */
    failWrites: () => {
      writesFailing = true
    },
    /** Les écritures ne se terminent jamais. */
    stallWrites: () => {
      writesStalled = true
    },
    /** Nombre de `close()` du port qui ont abouti. */
    closeCount: () => closeCount,
    isOpen: () => isOpen,
    /** Verrous de flux encore tenus (un `close()` du port est alors refusé). */
    locked: () => readerLocked || writerLocked,
  }
}

/** Laisse les promesses (lecture du port, écritures) se résoudre, sans aucun délai réel. */
export const flush = async () => {
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve()
  }
}

/** Avance l'horloge simulée par pas, en laissant les promesses se résoudre entre deux pas. */
export async function advance(clock: ManualClock, ms: number, step = 25, each?: () => void) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    clock.advance(Math.min(step, ms - elapsed))
    each?.()
    await flush()
  }
}
