import { SMOKE_HARD_LIMITS } from '../lighting/smoke'

/**
 * Protocole série de la carte de fumée (cf. `docs/cadrage/conception-fumee-carte-usb.md` §3).
 * Texte ASCII, une ligne par message terminée par `\n`, 9600 bauds 8N1. Fonctions pures : aucune
 * entrée-sortie ici.
 */

/** Numéro de protocole accepté. Une autre valeur est refusée, jamais « devinée ». */
export const BOARD_PROTOCOL = 1
export const BOARD_BAUD_RATE = 9600

/**
 * Bail maximal accepté dans la bannière : la valeur de `WATCHDOG_STALL_MS` (lumières), recopiée ici
 * pour ne pas dépendre du contrôleur de lumières ; un test garde les deux égales.
 */
export const BOARD_MAX_LEASE_MS = 500
/** Écart minimal entre deux ordres `F` envoyés à la carte. */
export const BOARD_FIRE_INTERVAL_MS = 100

/** Début d'une bannière. L'espace final évite de confondre avec un mot qui commencerait pareil. */
const BANNER_MAGIC = 'QZF READY '

/** Une ligne de la carte plus longue (avant le `\n`, `\r` compris) est rejetée. */
export const BOARD_MAX_LINE_BYTES = 64

export const BOARD_OUTPUT_STATES = ['READY', 'FIRE', 'COOL'] as const
export const BOARD_CAUSES = ['LEASE', 'MAX', 'CMD', 'BAD'] as const
export type BoardOutputState = (typeof BOARD_OUTPUT_STATES)[number]
export type BoardCause = (typeof BOARD_CAUSES)[number]

/** Ligne d'état envoyée par la carte après chaque ligne reçue. */
export type BoardStatusLine = {
  /** A0 au niveau haut (la machine reçoit l'ordre de fumer). */
  output: boolean
  state: BoardOutputState
  /** Dernière cause de coupure : bail expiré, plafond atteint, ordre `0`, ligne illisible. */
  cause: BoardCause
}

/** Valeurs compilées dans la carte, annoncées au démarrage (millisecondes). */
export type BoardBanner = {
  version: string
  maxFireMs: number
  cooldownMs: number
  leaseMs: number
}

export type BannerRejection =
  /** La ligne n'est pas une bannière (octets parasites, autre message) : on continue d'attendre. */
  | 'not_banner'
  /** `QZF READY` mais un autre numéro de protocole. */
  | 'other_protocol'
  /** Nombre de champs faux, valeur non numérique, nulle, avec zéros de tête, version illisible. */
  | 'invalid_values'
  /** Valeurs plus permissives que les limites du projet (voir `parseBanner`). */
  | 'too_permissive'

export type BannerResult =
  { ok: true; banner: BoardBanner } | { ok: false; reason: BannerRejection }

/** La ligne contient-elle le début d'une bannière (valide ou non) ? */
export const isBannerLine = (line: string) => line.includes(BANNER_MAGIC)

const POSITIVE_INTEGER = /^[1-9]\d{0,8}$/
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/

/**
 * Lit `QZF READY <protocole> <version> <plafond_ms> <pause_ms> <bail_ms>`.
 *
 * Des octets parasites **avant** `QZF READY` sont tolérés (une remise à zéro à l'ouverture du
 * port en laisse parfois) : la bannière ne fait qu'autoriser le lien, et ses valeurs sont
 * contrôlées champ par champ. Rien n'est toléré après.
 *
 * « Plus permissif » veut dire, pour chacune des trois limites de `SMOKE_HARD_LIMITS` /
 * `BOARD_MAX_LEASE_MS` : plafond d'un jet **au-dessus** de `maxDurationMs` (10 s), pause entre deux
 * jets **en dessous** de `minCooldownMs` (5 s), bail **au-dessus** de `BOARD_MAX_LEASE_MS` (500 ms).
 * Une carte plus stricte (plafond plus court, pause plus longue, bail plus court) est acceptée :
 * elle coupe seulement plus tôt. Les valeurs égales aux limites sont acceptées.
 */
export function parseBanner(line: string): BannerResult {
  const start = line.indexOf(BANNER_MAGIC)
  if (start < 0) {
    return { ok: false, reason: 'not_banner' }
  }
  const fields = line.slice(start).split(' ')
  if (fields.length !== 7) {
    return { ok: false, reason: 'invalid_values' }
  }
  const [, , protocol, version, maxFire, cooldown, lease] = fields as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ]
  if (!POSITIVE_INTEGER.test(protocol)) {
    return { ok: false, reason: 'invalid_values' }
  }
  if (Number(protocol) !== BOARD_PROTOCOL) {
    return { ok: false, reason: 'other_protocol' }
  }
  if (
    !VERSION.test(version) ||
    !POSITIVE_INTEGER.test(maxFire) ||
    !POSITIVE_INTEGER.test(cooldown) ||
    !POSITIVE_INTEGER.test(lease)
  ) {
    return { ok: false, reason: 'invalid_values' }
  }
  const banner: BoardBanner = {
    version,
    maxFireMs: Number(maxFire),
    cooldownMs: Number(cooldown),
    leaseMs: Number(lease),
  }
  if (
    banner.maxFireMs > SMOKE_HARD_LIMITS.maxDurationMs ||
    banner.cooldownMs < SMOKE_HARD_LIMITS.minCooldownMs ||
    banner.leaseMs > BOARD_MAX_LEASE_MS
  ) {
    return { ok: false, reason: 'too_permissive' }
  }
  // Un bail plus court que deux envois de `F` couperait le jet entre deux ordres normaux.
  if (banner.leaseMs < 2 * BOARD_FIRE_INTERVAL_MS) {
    return { ok: false, reason: 'invalid_values' }
  }
  return { ok: true, banner }
}

const STATUS_LINE = /^S ([01]) (READY|FIRE|COOL) (LEASE|MAX|CMD|BAD)$/

/**
 * Lit `S <0|1> <READY|FIRE|COOL> <LEASE|MAX|CMD|BAD>` ; `null` pour toute autre ligne, et pour une
 * ligne incohérente : la sortie n'est allumée que pendant un jet (`S 1` seulement avec `FIRE`).
 */
export function parseStatusLine(line: string): BoardStatusLine | null {
  const match = STATUS_LINE.exec(line)
  if (!match) {
    return null
  }
  const output = match[1] === '1'
  if (output !== (match[2] === 'FIRE')) {
    return null
  }
  return {
    output,
    state: match[2] as BoardOutputState,
    cause: match[3] as BoardCause,
  }
}

export type BoardCommand = 'fire' | 'off' | 'hello'

const COMMAND_LINES: Record<BoardCommand, string> = { fire: 'F\n', off: '0\n', hello: 'H\n' }

/**
 * Octets d'une commande. Seule la ligne exacte `F` allume la sortie de la carte ; `\n` seul
 * termine la ligne (jamais `\r\n`, qui serait pour elle une ligne illisible, donc une coupure).
 */
export function encodeBoardCommand(command: BoardCommand): Uint8Array {
  return Uint8Array.from(COMMAND_LINES[command], (char) => char.charCodeAt(0))
}

export type LineSplitter = {
  /**
   * Ajoute des octets reçus. Renvoie les lignes complètes (sans `\n` ni `\r` final, lignes vides
   * ignorées) et le nombre de lignes rejetées parce que trop longues.
   */
  push: (chunk: Uint8Array) => { lines: string[]; rejected: number }
}

/**
 * Découpe un flux d'octets en lignes. Le tampon ne dépasse jamais `maxLineBytes` : une ligne plus
 * longue est jetée en entier, jusqu'à son `\n`, et comptée comme rejetée. Les octets sont lus
 * comme du latin-1 : un octet non ASCII donne une ligne que les lecteurs ci-dessus refusent.
 */
export function createLineSplitter(maxLineBytes = BOARD_MAX_LINE_BYTES): LineSplitter {
  let buffer: number[] = []
  let discarding = false

  return {
    push(chunk) {
      const lines: string[] = []
      let rejected = 0
      for (const byte of chunk) {
        if (byte === 0x0a) {
          if (discarding) {
            rejected += 1
          } else {
            if (buffer.at(-1) === 0x0d) {
              buffer.pop()
            }
            if (buffer.length > 0) {
              lines.push(String.fromCharCode(...buffer))
            }
          }
          buffer = []
          discarding = false
        } else if (!discarding) {
          if (buffer.length >= maxLineBytes) {
            buffer = []
            discarding = true
          } else {
            buffer.push(byte)
          }
        }
      }
      return { lines, rejected }
    },
  }
}
