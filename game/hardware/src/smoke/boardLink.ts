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
  BOARD_FIRE_INTERVAL_MS,
  createLineSplitter,
  encodeBoardCommand,
  isBannerLine,
  parseBanner,
  parseStatusLine,
} from './boardProtocol'

/** Attente maximale de la bannière après l'ouverture (la carte redémarre à l'ouverture du port). */
export const BOARD_BANNER_TIMEOUT_MS = 3000
export { BOARD_FIRE_INTERVAL_MS }
/** Un `H` part quand rien n'a été envoyé depuis ce délai : la carte répond, on sait qu'elle vit. */
export const BOARD_PRESENCE_MS = 250
/** Carte déclarée muette après ce délai sans ligne d'état alors qu'on lui parle. */
export const BOARD_SILENCE_MS = 1000
/** Pas de la surveillance (présence, silence). */
const TICK_MS = 100
/** Erreurs de lecture passagères : le port reste là, `port.readable` rend un flux neuf. */
const TRANSIENT_READ_ERRORS = ['FramingError', 'ParityError', 'BufferOverrunError', 'BreakError']
/** Erreurs passagères de suite, sans une ligne lue entre-temps, avant de déclarer la carte perdue. */
const MAX_TRANSIENT_READ_ERRORS = 3

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

/** Ligne envoyée à la carte et pas encore répondue (elle répond une ligne d'état par ligne reçue). */
type SentLine = {
  command: BoardCommand
  at: number
  /** Une sortie allumée dans la réponse à cette ligne est normale (jet entretenu par un `F` récent). */
  mayLight: boolean
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
  let splitter = createLineSplitter()

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
  /** Lignes envoyées dans l'ordre, en attente de leur ligne d'état. La plus ancienne dit si la carte se tait. */
  const sentLines: SentLine[] = []
  /** Écritures lancées et pas terminées (port qui n'avale plus rien) : ni `F` ni `H` ne s'y empilent. */
  let writing = 0
  /** Un `F` a été envoyé et aucun `0` depuis : la carte peut légitimement avoir la sortie allumée. */
  let fireLive = false
  /** Instant où le dernier `F` est parti pour de bon (écriture terminée) ; `null` : encore en route. */
  let fireWrittenAt: number | null = null
  /** `0` envoyés dont la ligne d'état n'est pas encore revenue : aucun `F` avant elle. */
  let offsInFlight = 0
  let opening: Promise<SmokeBoardStatus> | null = null

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

  /**
   * Abandonne le writer : `abort()` jette les octets en file (une interface figée ne les enverra
   * jamais), `releaseLock()` déverrouille le flux. Sans cela `port.close()` est refusé (flux
   * verrouillé) et le port ne se rouvre plus. `abort()` n'est pas attendu : il peut ne jamais
   * aboutir sur une interface figée. (Même geste que la sortie DMX série.)
   */
  const discardWriter = (target: WritableStreamDefaultWriter<Uint8Array>) => {
    target.abort().catch(() => undefined)
    try {
      target.releaseLock()
    } catch {
      // Verrou déjà rendu.
    }
  }

  const dropWriter = () => {
    const current = writer
    writer = null
    if (current) {
      discardWriter(current)
    }
  }

  /** Passe dans un état d'échec : plus aucun envoi, sauf un `0` de dernier recours. */
  const fail = (status: SmokeBoardStatus, problem: SmokeBoardProblem) => {
    if (SETTLED.includes(state.status)) {
      return
    }
    stopTimers()
    // Silence, contradiction, lecture perdue : on ne sait plus ce que fait la carte, un `0` part
    // encore (il passe si le sens d'écriture marche). Un port qui n'écrit plus n'en a pas besoin.
    if (status === 'silent' || status === 'fault' || problem === 'read_error') {
      writer?.write(encodeBoardCommand('off')).catch(() => undefined)
    }
    if (status === 'disconnected') {
      dropWriter()
    }
    // Plus de phase ni de dernière ligne : elles ne décrivent plus une carte qui répond.
    update({ status, problem, board: null, phase: null })
  }

  /** Une sortie allumée est-elle normale dans la réponse à une ligne envoyée à `at` ? */
  const mayLightAt = (at: number) =>
    fireLive && (fireWrittenAt === null || at - fireWrittenAt <= leaseMs + BOARD_FIRE_INTERVAL_MS)

  const send = (command: BoardCommand) => {
    if (!writer) {
      return
    }
    const at = clock.now()
    lastSentAt = at
    if (command === 'fire') {
      fireLive = true
      fireWrittenAt = null
      lastFireAt = at
    } else if (command === 'off') {
      fireLive = false
      offsInFlight += 1
    }
    // Jugé à l'envoi : la lecture de la réponse peut venir bien plus tard (page ralentie) sans que
    // la carte ait rien fait de faux.
    sentLines.push({ command, at, mayLight: mayLightAt(at) })
    writing += 1
    writer.write(encodeBoardCommand(command)).then(
      () => {
        writing -= 1
        if (command === 'fire') {
          fireWrittenAt = clock.now()
        }
      },
      () => {
        writing -= 1
        if (!closing) {
          fail('disconnected', 'write_error')
        }
      }
    )
  }

  const tick = () => {
    const now = clock.now()
    const oldest = sentLines[0]
    if (oldest !== undefined && now - oldest.at >= BOARD_SILENCE_MS) {
      fail('silent', 'no_reply')
    } else if (writing === 0 && now - lastSentAt >= BOARD_PRESENCE_MS) {
      send('hello')
    }
  }

  const onStatusLine = (line: BoardStatusLine) => {
    const answered = sentLines.shift()
    if (answered?.command === 'off') {
      offsInFlight = Math.max(0, offsInFlight - 1)
    }
    if (!sameLine(state.board, line)) {
      update({ board: line, phase: line.state.toLowerCase() as SmokeBoardPhase })
    }
    // Sortie allumée alors que la ligne à laquelle la carte répond ne pouvait pas l'allumer (aucun
    // `F` récent, ou un `0` entre-temps).
    if (line.output && !(answered?.mayLight ?? mayLightAt(clock.now()))) {
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
      lastSentAt = clock.now()
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

  /**
   * Lit la carte. Une erreur passagère (`FramingError`...) rend un flux neuf dans `port.readable` :
   * on le reprend. Toute autre erreur, un flux qui se termine ou un `readable` nul (câble
   * débranché) : carte perdue.
   */
  const readLoop = async (first: ReadableStreamDefaultReader<Uint8Array>) => {
    let source = first
    let transient = 0
    for (;;) {
      try {
        const { done, value } = await source.read()
        if (done) {
          break
        }
        transient = 0
        for (const line of splitter.push(value).lines) {
          onLine(line)
        }
      } catch (error) {
        const name = (error as { name?: string } | null)?.name ?? ''
        const next = port.readable
        if (
          closing ||
          !TRANSIENT_READ_ERRORS.includes(name) ||
          transient >= MAX_TRANSIENT_READ_ERRORS ||
          !next
        ) {
          break
        }
        transient += 1
        // La ligne en cours est perdue avec le flux en erreur.
        splitter = createLineSplitter()
        try {
          source.releaseLock()
          source = next.getReader()
          reader = source
        } catch {
          break
        }
      }
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

  /** Même résultat qu'une promesse : n'échoue jamais, ne signale rien. */
  const quiet = (work: Promise<unknown>) =>
    work.then(
      () => undefined,
      () => undefined
    )

  const connect = async () => {
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
    bannerTimer = clock.setTimeout(() => fail('no_firmware', 'no_banner'), BOARD_BANNER_TIMEOUT_MS)
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
  }

  return {
    open() {
      // Un second appel pendant la connexion attend la même ouverture, il n'en lance pas une autre.
      if (opening) {
        return opening
      }
      if (state.status !== 'idle') {
        return Promise.resolve(state.status)
      }
      opening = connect().finally(() => {
        opening = null
      })
      return opening
    },

    drive(firing) {
      if (state.status !== 'ready') {
        return
      }
      if (firing) {
        const { phase } = state
        if (
          (phase === 'ready' || phase === 'fire') &&
          // Pas de `F` derrière un `0` dont la réponse n'est pas revenue, ni derrière une écriture
          // qui n'est pas partie : au déblocage de l'USB ils arriveraient en rafale.
          offsInFlight === 0 &&
          writing === 0 &&
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
        update({ status: 'closed', board: null, phase: null })
      }
      const current = writer
      const currentReader = reader
      writer = null
      reader = null
      // Chaque étape est bornée et indépendante des autres : une carte figée qui n'avale plus le `0`
      // ne doit empêcher ni de rendre les verrous ni de fermer le port.
      if (goodbye && current) {
        await bounded(quiet(current.write(encodeBoardCommand('off'))), SERIAL_CLOSE_TIMEOUT_MS)
      }
      if (current) {
        discardWriter(current)
      }
      if (currentReader) {
        await bounded(quiet(currentReader.cancel()), SERIAL_CLOSE_TIMEOUT_MS)
        try {
          currentReader.releaseLock()
        } catch {
          // Verrou déjà rendu.
        }
      }
      await bounded(quiet(port.close()), SERIAL_CLOSE_TIMEOUT_MS)
    },
  }
}
