import { isIPv4 } from 'node:net'

import { DMX_CHANNELS } from './artnet.js'

/**
 * Protocole écran de salle → pont, version 1. Miroir de `game/hardware/src/dmx/bridgeOutput.ts`
 * (les deux côtés sont testés octet par octet sur le même format).
 *
 * 1. Le navigateur envoie un message **texte** `{"type":"hello","protocol":1,"universe":0}`
 *    (`universe` : champ historique, accepté de 0 à 15).
 * 2. Le pont répond `{"type":"ack","protocol":1,"bridge":"quizzup-artnet-bridge","version":"…"}`
 *    ou `{"type":"error","code":"…","message":"…"}` puis ferme.
 *
 * Version 2 du `hello` (le format des trames ne change pas) : `{"type":"hello","protocol":1,
 * "version":2,"universe":0,"artnet":{"target":"192.168.1.50","port":6454}}`. `artnet` (facultatif)
 * porte la cible réglée dans l'écran de salle ; le pont l'applique sauf si `--target` a été donné
 * en ligne de commande, la refuse hors des réseaux locaux, et l'ack (v2 seulement) annonce la cible
 * effective : `"artnet":{"target":"192.168.1.50","port":6454,"source":"room"}`. Un `hello` sans
 * `version` est en v1 : traité et acquitté exactement comme avant.
 * 3. Chaque trame est un message **binaire** de 515 octets : version (1), univers interne (0 à 15)
 *    sur 2 octets gros-boutiste, puis les 512 canaux. Une trame par univers utilisé, au fil de l'eau.
 */
export const BRIDGE_PROTOCOL_VERSION = 1
/** Version du `hello` qui porte la cible Art-Net (cf. ci-dessus). */
export const BRIDGE_HELLO_VERSION = 2
export const BRIDGE_FRAME_HEADER_BYTES = 3
export const BRIDGE_FRAME_BYTES = BRIDGE_FRAME_HEADER_BYTES + DMX_CHANNELS
export const BRIDGE_NAME = 'quizzup-artnet-bridge'

/** Univers internes acceptés : 0 à 15 (le protocole reste la version 1, d'abord limitée au 0). */
export const MAX_INTERNAL_UNIVERSES = 16

export const isInternalUniverse = (universe: number) =>
  Number.isInteger(universe) && universe >= 0 && universe < MAX_INTERNAL_UNIVERSES

/** Codes de fermeture WebSocket propres au pont (plage 4000-4999 réservée aux applications). */
export const CLOSE_CODES = {
  helloExpected: 4000,
  protocol: 4001,
  universe: 4002,
  badFrame: 4003,
  busy: 4004,
  target: 4005,
} as const

/**
 * Refus d'un second écran de salle. Un navigateur ne voit pas le statut HTTP d'une poignée de main
 * refusée (409 apparaîtrait comme « pont injoignable ») : le pont accepte donc la connexion, envoie
 * ce message d'erreur puis ferme, pour que l'écran l'affiche tel quel.
 */
export const BUSY_MESSAGE = 'un autre onglet est déjà connecté au pont'

export type DecodedFrame =
  { ok: true; universe: number; data: Uint8Array } | { ok: false; reason: string }

export function decodeFrame(message: Uint8Array): DecodedFrame {
  if (message.length !== BRIDGE_FRAME_BYTES) {
    return {
      ok: false,
      reason: `trame de ${message.length} octets, attendu ${BRIDGE_FRAME_BYTES}`,
    }
  }
  if (message[0] !== BRIDGE_PROTOCOL_VERSION) {
    return {
      ok: false,
      reason: `trame en version ${message[0]}, attendu ${BRIDGE_PROTOCOL_VERSION}`,
    }
  }
  return {
    ok: true,
    universe: (message[1]! << 8) | message[2]!,
    data: message.subarray(BRIDGE_FRAME_HEADER_BYTES),
  }
}

/** Cible Art-Net demandée par l'écran de salle (valeurs brutes, validées par `checkArtnetRequest`). */
export type ArtnetRequest = { target?: unknown; port?: unknown }

export type Hello = { protocol: number; universe: number; version: number; artnet?: ArtnetRequest }

/** Lit le message `hello` ; `null` si ce n'en est pas un. */
export function parseHello(text: string): Hello | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') {
    return null
  }
  const raw = parsed as Record<string, unknown>
  if (raw.type !== 'hello' || typeof raw.protocol !== 'number') {
    return null
  }
  const version = typeof raw.version === 'number' ? raw.version : 1
  const artnet =
    version >= BRIDGE_HELLO_VERSION && raw.artnet && typeof raw.artnet === 'object'
      ? (raw.artnet as ArtnetRequest)
      : undefined
  return {
    protocol: raw.protocol,
    universe: typeof raw.universe === 'number' ? raw.universe : 0,
    version,
    ...(artnet ? { artnet: { target: artnet.target, port: artnet.port } } : {}),
  }
}

/**
 * Cibles acceptées depuis l'écran de salle : réseaux privés RFC 1918 (10/8, 172.16/12, 192.168/16),
 * link-local (169.254/16) et boucle locale (127/8). Une page web ne doit pas pouvoir faire envoyer
 * de l'UDP vers Internet. (Ne s'applique pas à `--target`, choisi par l'opérateur du PC.)
 */
export function isAllowedArtnetTarget(ip: string): boolean {
  if (!isIPv4(ip)) {
    return false
  }
  const [first, second] = ip.split('.').map(Number) as [number, number]
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  )
}

export const ARTNET_TARGET_RANGES = '10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x, 127.x.x.x'

export type ArtnetCheck =
  { ok: true; target: string; port?: number } | { ok: false; message: string }

/** Valide la cible demandée par l'écran de salle (message d'erreur lisible dans l'écran). */
export function checkArtnetRequest(request: ArtnetRequest): ArtnetCheck {
  const { target, port } = request
  if (typeof target !== 'string' || !isIPv4(target)) {
    return { ok: false, message: `cible Art-Net « ${String(target)} » : adresse IPv4 attendue` }
  }
  if (!isAllowedArtnetTarget(target)) {
    return {
      ok: false,
      message: `cible Art-Net ${target} refusée : seules les adresses du réseau local sont acceptées (${ARTNET_TARGET_RANGES})`,
    }
  }
  if (port === undefined) {
    return { ok: true, target }
  }
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65_535) {
    return { ok: false, message: `port Art-Net « ${String(port)} » : entier de 1 à 65535 attendu` }
  }
  return { ok: true, target, port }
}

/** D'où vient la cible effective : ligne de commande, écran de salle, ou aucune. */
export type ArtnetSource = 'cli' | 'room' | 'none'
export type ArtnetAck = { target: string | null; port: number; source: ArtnetSource }

/** `universes` : nombre d'univers internes acceptés (un ancien pont ne l'annonce pas : 1 seul). */
export const ackMessage = (version: string, artnet?: ArtnetAck) =>
  JSON.stringify({
    type: 'ack',
    protocol: BRIDGE_PROTOCOL_VERSION,
    bridge: BRIDGE_NAME,
    version,
    universes: MAX_INTERNAL_UNIVERSES,
    ...(artnet ? { artnet } : {}),
  })

export const errorMessage = (code: string, message: string) =>
  JSON.stringify({ type: 'error', code, message })
