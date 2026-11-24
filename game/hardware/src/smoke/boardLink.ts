import type { Clock, TimerHandle } from '../clock'
import { browserClock } from '../clock'
import type { SerialPortLike } from '../dmx/serialOutput'
import { describeSerialError, SERIAL_CLOSE_TIMEOUT_MS } from '../dmx/serialOutput'
import { createEmitter } from '../emitter'
import type { Unsubscribe } from '../types'
import type {
  BannerRejection,
  BoardCommand,
  BoardOutputState,
  BoardStatusLine,
} from './boardProtocol'
import {
  BOARD_BAUD_RATE,
  createLineSplitter,
  encodeBoardCommand,
  isBannerLine,
  parseBanner,
  parseStatusLine,
} from './boardProtocol'

/** Attente maximale de la bannière après l'ouverture (la carte redémarre à l'ouverture du port). */
export const BOARD_BANNER_TIMEOUT_MS = 3000
/** Écart minimal entre deux ordres `F`, même si l'appelant en redemande à chaque trame. */
export const BOARD_FIRE_INTERVAL_MS = 100
/** Un `H` part quand rien n'a été envoyé depuis ce délai : la carte répond, on sait qu'elle vit. */
export const BOARD_PRESENCE_MS = 250
/** Carte déclarée muette après ce délai sans ligne d'état alors qu'on lui parle. */
export const BOARD_SILENCE_MS = 1000
/** Pas de la surveillance (présence, silence). */
const TICK_MS = 100

/** Sous-ensemble de `SerialPort` utilisé : le port DMX, plus la lecture. */
export type SmokeBoardPort = SerialPortLike & { readable: ReadableStream<Uint8Array> | null }

export type SmokeBoardStatus =
  /** Créé, `open()` pas encore appelé. */
  | 'idle'
  /** Port ouvert, bannière attendue : aucun ordre ne part. */
  | 'connecting'
  /** Bannière valide reçue, carte qui répond : `drive` agit. */
  | 'ready'
  /** Pas de bannière valide : programme absent, autre protocole ou plus permissif que le projet. */
  | 'no_firmware'
  /** La carte ne répond plus alors qu'on lui parle. */
  | 'silent'
  /** Port impossible à ouvrir, erreur de lecture ou d'écriture, câble débranché. */
  | 'disconnected'
  /** La carte contredit nos ordres (sortie allumée sans ordre, ou redémarrage inattendu). */
  | 'fault'
  /** Fermé par `close()`. */
  | 'closed'

export type SmokeBoardProblem =
  | Exclude<BannerRejection, 'not_banner'>
  | 'no_banner'
  | 'open_error'
  | 'read_error'
  | 'write_error'
  | 'no_reply'
  | 'output_mismatch'
  | 'board_reset'

/** Phase de la carte lue dans sa dernière ligne d'état : prête, jet en cours, pause. */
export type SmokeBoardPhase = Lowercase<BoardOutputState>

export type SmokeBoardState = {
  status: SmokeBoardStatus
  /** Cause de l'état d'échec (`no_firmware`, `silent`, `disconnected`, `fault`). */
  problem: SmokeBoardProblem | null
  /** Version du programme de la carte, lue dans la bannière. */
  version: string | null
  /** Dernière ligne d'état reçue de la carte. */
  board: BoardStatusLine | null
  /**
   * Phase lue dans la dernière ligne d'état (`null` tant qu'aucune n'est arrivée). Le lien
   * n'envoie `F` qu'en `ready` ou `fire` : en `cool` (pause, dont les 5 s qui suivent chaque remise
   * à zéro de la carte) aucun jet ne peut partir, l'appelant doit le refuser plutôt que d'afficher
   * une fumée qui ne sort pas.
   */
  phase: SmokeBoardPhase | null
}

export type SmokeBoardLinkOptions = {
  port: SmokeBoardPort
  /** Horloge et minuteurs. Injectable en test. */
  clock?: Clock
}

export type SmokeBoardLink = {
  /**
   * Ouvre le port et attend la bannière. Rend l'état final de la phase de connexion : `ready`,
   * ou un état d'échec. Ne rejette pas. Un lien ne s'ouvre qu'une fois : après un échec, un
   * rechargement ou un rebranchement, on en crée un autre.
   */
  open: () => Promise<SmokeBoardStatus>
  /**
   * À appeler à **chaque trame** avec « la fumée doit sortir maintenant ». Le lien ne renouvelle
   * jamais `F` de lui-même : si l'appelant s'arrête, la carte coupe à la fin du bail (c'est ce
   * qui fait fonctionner le test de coupure). `true` envoie `F` au plus toutes les 100 ms, et
   * seulement si la dernière ligne d'état dit `ready` (début de jet) ou `fire` (renouvellement du
   * bail) : en `cool`, ou avant la première ligne, rien ne part. `false` envoie `0` une fois, tout
   * de suite, quand un `F` a été envoyé. Sans effet hors de l'état `ready`.
   */
  drive: (firing: boolean) => void
  getState: () => SmokeBoardState
  /** Prévient à chaque changement d'état, de ligne d'état ou de problème. */
  onChange: (listener: (state: SmokeBoardState) => void) => Unsubscribe
  /** Envoie `0` si la carte est identifiée et le port encore là, libère le port. Ne rejette pas. */
  close: () => Promise<void>
}

const sameLine = (left: BoardStatusLine | null, right: BoardStatusLine) =>
  left !== null &&
  left.output === right.output &&
  left.state === right.state &&
  left.cause === right.cause

const SETTLED: readonly SmokeBoardStatus[] = [
  'no_firmware',
  'silent',
  'disconnected',
  'fault',
  'closed',
]

/**
 * Lien vers la carte de fumée (Arduino Uno programmé pour QuizzUp), par Web Serial. Voir
 * `docs/cadrage/conception-fumee-carte-usb.md`.
 *
 * Ce que le lien garantit : aucun ordre `F` avant une bannière valide ; plus aucun ordre après
 * un échec ; `F` jamais plus d'une fois par 100 ms ; la carte contredite ou muette est signalée
 * (l'appelant coupe la fumée et désarme). Ce qu'il ne garantit pas : c'est la carte qui coupe
 * (bail, plafond, pause) ; le lien ne peut que l'observer.
 */
export function createSmokeBoardLink(options: SmokeBoardLinkOptions): SmokeBoardLink {
  const { port } = options
  const clock = options.clock ?? browserClock
  const emitter = createEmitter<SmokeBoardState>()
  const splitter = createLineSplitter()

  let state: SmokeBoardState = {
    status: 'idle',
    problem: null,
    version: null,
    board: null,
    phase: null,
  }
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let bannerTimer: TimerHandle | undefined
  let tickTimer: TimerHandle | undefined
  let closing = false
  /** Bannière valide reçue : la carte est bien la nôtre, on peut lui parler. */
  let identified = false
  let leaseMs = 0
  /** Dernier ordre donné par l'appelant. */
  let ordered: 'fire' | 'off' = 'off'
  let lastSentAt = Number.NEGATIVE_INFINITY
  let lastFireAt = Number.NEGATIVE_INFINITY
  /** Instant du dernier ordre (`F` ou `0`), pour juger ce que la carte annonce. */
  let lastOrderAt = 0
  /** Premier envoi depuis la dernière ligne d'état reçue ; `null` si rien n'attend de réponse. */
  let awaitingSince: number | null = null

  const getState = (): SmokeBoardState => state

  const update = (patch: Partial<SmokeBoardState>) => {
    state = { ...state, ...patch }
    emitter.emit(state)
  }

  const stopTimers = () => {
    if (bannerTimer !== undefined) {
      clock.clearTimeout(bannerTimer)
    }
    if (tickTimer !== undefined) {
      clock.clearInterval(tickTimer)
    }
  }

  const dropWriter = () => {
    const current = writer
    writer = null
    if (current) {
      current.abort().catch(() => undefined)
      try {
        current.releaseLock()
      } catch {
        // Verrou déjà rendu.
      }
    }
  }

  /** Passe dans un état d'échec : plus aucun envoi, sauf un `0` de dernier recours. */
  const fail = (status: SmokeBoardStatus, problem: SmokeBoardProblem) => {
    if (SETTLED.includes(state.status)) {
      return
    }
    stopTimers()
    if (status === 'disconnected') {
      dropWriter()
    } else if (status === 'silent' || status === 'fault') {
      writer?.write(encodeBoardCommand('off')).catch(() => undefined)
    }
    update({ status, problem })
  }

  const send = (command: BoardCommand) => {
    if (!writer) {
      return
    }
    const at = clock.now()
    lastSentAt = at
    awaitingSince ??= at
    if (command !== 'hello') {
      lastOrderAt = at
    }
    if (command === 'fire') {
      lastFireAt = at
    }
    writer.write(encodeBoardCommand(command)).catch(() => {
      if (!closing) {
        fail('disconnected', 'write_error')
      }
    })
  }

  const tick = () => {
    const now = clock.now()
    if (awaitingSince !== null && now - awaitingSince >= BOARD_SILENCE_MS) {
      fail('silent', 'no_reply')
    } else if (now - lastSentAt >= BOARD_PRESENCE_MS) {
      send('hello')
    }
  }

  const onStatusLine = (line: BoardStatusLine) => {
    const now = clock.now()
    awaitingSince = null
    if (!sameLine(state.board, line)) {
      update({ board: line, phase: line.state.toLowerCase() as SmokeBoardPhase })
    }
    // Sortie allumée alors que le dernier ordre (`F` ou `0`) date de plus d'un bail : le bail
    // d'un `F` se mesure de la carte à nous, d'où une période d'envoi de marge pour la latence USB.
    if (line.output && now - lastOrderAt > leaseMs + BOARD_FIRE_INTERVAL_MS) {
      fail('fault', 'output_mismatch')
    } else if (line.state === 'COOL' && ordered === 'fire') {
      // Un `F` est arrivé en pause (course entre la page et la carte) : la carte l'a refusé et
      // ignore les `F` suivants. Un `0`, une seule fois, lève ce verrou ; `drive` n'enverra plus
      // de `F` avant d'avoir lu `ready`.
      ordered = 'off'
      send('off')
    }
  }

  const onLine = (line: string) => {
    if (state.status === 'connecting') {
      const result = parseBanner(line)
      if (!result.ok) {
        if (result.reason !== 'not_banner') {
          fail('no_firmware', result.reason)
        }
        return
      }
      stopTimers()
      identified = true
      leaseMs = result.banner.leaseMs
      const now = clock.now()
      lastSentAt = now
      lastOrderAt = now
      tickTimer = clock.setInterval(tick, TICK_MS)
      update({ status: 'ready', problem: null, version: result.banner.version })
      // Première question à la carte : dans quelle phase est-elle (pause de 5 s après sa remise à zéro) ?
      send('hello')
    } else if (state.status === 'ready') {
      if (isBannerLine(line)) {
        // La carte a redémarré en cours de partie : ses minuteurs (plafond, pause) sont à zéro.
        fail('fault', 'board_reset')
        return
      }
      const parsed = parseStatusLine(line)
      if (parsed) {
        onStatusLine(parsed)
      }
    }
  }

  const readLoop = async (source: ReadableStreamDefaultReader<Uint8Array>) => {
    try {
      for (;;) {
        const { done, value } = await source.read()
        if (done) {
          break
        }
        for (const line of splitter.push(value).lines) {
          onLine(line)
        }
      }
    } catch {
      // Flux en erreur : même traitement qu'une fin de flux.
    }
    if (!closing) {
      fail('disconnected', 'read_error')
    }
  }

  const openPort = async () => {
    const settings = {
      baudRate: BOARD_BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
    } as const
    try {
      await port.open(settings)
    } catch (error) {
      // Port resté ouvert par cette page (rechargement à chaud) : on le referme, on réessaie une fois.
      if (describeSerialError(error).code !== 'already_open') {
        throw error
      }
      await port.close().catch(() => undefined)
      await port.open(settings)
    }
  }

  /** Attend `work` (qui ne rejette pas) au plus `ms` ; `false` si le délai a expiré. */
  const bounded = async (work: Promise<void>, ms: number) => {
    let timer: TimerHandle | undefined
    const finished = await Promise.race([
      work.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = clock.setTimeout(() => resolve(false), ms)
      }),
    ])
    if (timer !== undefined) {
      clock.clearTimeout(timer)
    }
    return finished
  }

  return {
    async open() {
      if (state.status !== 'idle') {
        return state.status
      }
      update({ status: 'connecting' })
      try {
        await openPort()
        if (closing) {
          await port.close().catch(() => undefined)
          return state.status
        }
        if (!port.writable || !port.readable) {
          throw new Error('Port ouvert sans flux')
        }
        writer = port.writable.getWriter()
        reader = port.readable.getReader()
      } catch {
        dropWriter()
        await port.close().catch(() => undefined)
        fail('disconnected', 'open_error')
        return state.status
      }
      bannerTimer = clock.setTimeout(
        () => fail('no_firmware', 'no_banner'),
        BOARD_BANNER_TIMEOUT_MS
      )
      void readLoop(reader)
      // Relu via `getState` : TypeScript ne voit pas que `fail` a pu changer l'état entre-temps.
      if (getState().status === 'connecting') {
        await new Promise<void>((resolve) => {
          const off = emitter.on((next) => {
            if (next.status !== 'connecting') {
              off()
              resolve()
            }
          })
        })
      }
      return state.status
    },

    drive(firing) {
      if (state.status !== 'ready') {
        return
      }
      if (firing) {
        const { phase } = state
        if (
          (phase === 'ready' || phase === 'fire') &&
          clock.now() - lastFireAt >= BOARD_FIRE_INTERVAL_MS
        ) {
          ordered = 'fire'
          send('fire')
        }
      } else if (ordered === 'fire') {
        ordered = 'off'
        send('off')
      }
    },

    getState,
    onChange: emitter.on,

    async close() {
      if (closing) {
        return
      }
      closing = true
      stopTimers()
      const goodbye = writer !== null && identified
      if (!SETTLED.includes(state.status)) {
        update({ status: 'closed' })
      }
      const current = writer
      const currentReader = reader
      writer = null
      reader = null
      const release = async () => {
        try {
          if (goodbye) {
            await current?.write(encodeBoardCommand('off'))
          }
          current?.releaseLock()
          await currentReader?.cancel()
          currentReader?.releaseLock()
        } catch {
          // Port débranché ou flux déjà rendu : rien de plus à faire.
        }
        await port.close().catch(() => undefined)
      }
      if (!(await bounded(release(), SERIAL_CLOSE_TIMEOUT_MS))) {
        // Carte figée : on abandonne les octets en file pour débloquer la fermeture.
        current?.abort().catch(() => undefined)
        port.writable?.abort?.().catch(() => undefined)
      }
    },
  }
}
