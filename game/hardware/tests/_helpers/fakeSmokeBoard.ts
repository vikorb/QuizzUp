import { WATCHDOG_STALL_MS } from '@hardware/lighting/lightingController'
import { SMOKE_HARD_LIMITS } from '@hardware/lighting/smoke'
import type { SmokeBoardPort } from '@hardware/smoke/boardLink'
import type { BoardCause, BoardOutputState } from '@hardware/smoke/boardProtocol'

import { createFumee } from './fumeeLogic'
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

/** Délai entre l'ouverture du port et la bannière (le chargeur attend environ une seconde). */
export const FAKE_BOARD_BANNER_DELAY_MS = 1000
/**
 * À attendre après la bannière pour que le lien lise `ready` : les 5 s de pause du démarrage, plus
 * 300 ms (le `H` de présence part au plus 250 ms plus tard et la carte y répond).
 */
export const FAKE_BOARD_WARM_MS = SMOKE_HARD_LIMITS.minCooldownMs + 300
/** Pas de la boucle simulée de la carte (en plus d'un tic à chaque ligne et à chaque `snapshot`). */
const BOARD_LOOP_MS = 1

export type FakeSmokeBoardOptions = {
  clock: ManualClock
  /** Bannière envoyée à chaque ouverture du port ; `null` : une carte sans notre programme. */
  banner?: string | null
  /** Texte glissé juste avant la bannière, sur la même ligne (parasites de remise à zéro). */
  noise?: string
  /** Délai entre l'ouverture du port et la bannière. */
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

const domError = (name: string, message: string) => Object.assign(new Error(message), { name })
const bytes = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0))

/**
 * Fausse carte de fumée sur un faux port série, pilotée par l'horloge simulée. Toute la décision
 * (bail de 500 ms, plafond de 10 s, pause de 5 s, verrou des `F` refusés, cause) est le port
 * ligne à ligne du programme de la carte (`fumeeLogic.ts`, comparé aux vecteurs partagés). Ici
 * seulement le port : une ligne d'état part après chaque ligne reçue, et la boucle de la carte
 * tourne (un tic à chaque ligne, à chaque `snapshot`, et toutes les ms). La carte démarre en
 * pause de 5 s comptée **depuis la bannière** (`fumee_init(millis())` dans `setup()`), puis
 * ouvrir le port la remet à zéro (comme le signal DTR d'un Uno).
 */
export function createFakeSmokeBoard(options: FakeSmokeBoardOptions) {
  const { clock } = options
  const banner = options.banner === undefined ? FAKE_BOARD_BANNER : options.banner
  let mute = options.mute ?? false

  /** Lignes reçues par la carte, avec l'instant de réception. */
  const received: { line: string; at: number }[] = []
  /** Lignes confiées au port par la page, qu'elles soient arrivées ou bloquées (carte figée). */
  const attempted: string[] = []
  let unplugged = false
  let writesStalled = false
  let writesFailing = false
  let isOpen = false
  let readerLocked = false
  let writerLocked = false
  let closeCount = 0
  let bannerTimer: ReturnType<typeof clock.setTimeout> | undefined
  let loopTimer: ReturnType<typeof clock.setInterval> | undefined
  /** Écritures bloquées (carte figée) : `abort()` les rejette, comme Chrome. */
  const stalled: ((error: Error) => void)[] = []

  // Programme de la carte.
  let program = createFumee(0)
  let lastCutAt: number | null = null

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

  /** Applique `step` au programme et note l'instant où un jet s'arrête. */
  const run = (at: number, step: () => void) => {
    const firing = program.fumee.state === 'FIRE'
    step()
    if (firing && program.fumee.state !== 'FIRE') {
      lastCutAt = at
    }
  }

  /** Un tour de la boucle de la carte : le temps passe, une échéance éventuelle coupe. */
  const tickTo = (now: number) => run(now, () => program.tick(now))

  const snapshot = (): FakeBoardSnapshot => {
    tickTo(clock.now())
    return {
      output: program.fumee.out === 1,
      state: program.fumee.state,
      cause: program.fumee.cause,
      lastCutAt,
    }
  }

  const handleLine = (line: string) => {
    const now = clock.now()
    tickTo(now)
    run(now, () => program.line(now, line))
    if (!mute) {
      const { output, state, cause } = snapshot()
      emit(`S ${output ? 1 : 0} ${state} ${cause}\n`)
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

  /** `setup()` de la carte : programme remis à zéro (pause de 5 s dès cet instant), bannière. */
  const boot = () => {
    program = createFumee(clock.now())
    lastCutAt = null
    if (banner !== null) {
      emit(`${options.noise ?? ''}${banner}\n`)
    }
  }

  /** Remise à zéro (ouverture du port) : la bannière arrive après le délai du chargeur. */
  const reset = () => {
    // Une carte sans notre programme (`banner: null`) n'envoie rien : sa pause part de l'ouverture.
    program = createFumee(clock.now())
    lastCutAt = null
    inbound = ''
    queue.length = 0
    cancelled = false
    waiting = null
    loopTimer = clock.setInterval(() => tickTo(clock.now()), BOARD_LOOP_MS)
    if (banner !== null) {
      bannerTimer = clock.setTimeout(boot, options.bannerDelayMs ?? FAKE_BOARD_BANNER_DELAY_MS)
    }
  }

  const rejectStalled = () => {
    for (const reject of stalled.splice(0)) {
      reject(domError('AbortError', 'The stream was aborted.'))
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
          attempted.push(String.fromCharCode(...chunk).trimEnd())
          if (writesStalled) {
            await new Promise<never>((_resolve, reject) => stalled.push(reject))
          }
          receive(chunk)
        },
        abort: async () => rejectStalled(),
        releaseLock: () => {
          writerLocked = false
        },
      }
    },
    abort: async () => rejectStalled(),
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
      if (loopTimer !== undefined) {
        clock.clearInterval(loopTimer)
      }
    },
    // Comme Chrome : un câble débranché rend `readable` et `writable` nuls.
    get readable() {
      return isOpen && !unplugged ? readable : null
    },
    get writable() {
      return isOpen && !unplugged ? writable : null
    },
  }

  return {
    port: port as unknown as SmokeBoardPort & { openedWith: unknown },
    /** État de la carte à l'instant de l'horloge (sortie, état, cause, dernière coupure). */
    snapshot,
    /** Lignes reçues par la carte. */
    received,
    /** Lignes que la page a tenté d'écrire (même celles qu'une écriture bloquée n'a pas livrées). */
    attempted,
    /** Texte tel qu'envoyé par la carte (ligne parasite, état forgé, bannière en cours de partie). */
    inject: emit,
    mute: (value: boolean) => {
      mute = value
    },
    /** Câble débranché : lectures et écritures échouent, `readable` devient nul. */
    unplug: () => {
      unplugged = true
      waiting?.reject(domError('NetworkError', 'The device has been lost.'))
      waiting = null
    },
    /** Erreur de lecture passagère (`FramingError`...) : le port reste là, un flux neuf est rendu. */
    failRead: (name: string) => {
      waiting?.reject(domError(name, 'Read error.'))
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
    /** Les écritures ne se terminent jamais, tant que le writer n'est pas abandonné (`abort`). */
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
