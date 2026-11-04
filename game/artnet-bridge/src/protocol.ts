import { DMX_CHANNELS } from './artnet.js'

/**
 * Protocole écran de salle → pont, version 1. Miroir de `game/hardware/src/dmx/bridgeOutput.ts`
 * (les deux côtés sont testés octet par octet sur le même format).
 *
 * 1. Le navigateur envoie un message **texte** `{"type":"hello","protocol":1,"universe":0}`
 *    (`universe` : champ historique, accepté de 0 à 15).
 * 2. Le pont répond `{"type":"ack","protocol":1,"bridge":"quizzup-artnet-bridge","version":"…"}`
 *    ou `{"type":"error","code":"…","message":"…"}` puis ferme.
 * 3. Chaque trame est un message **binaire** de 515 octets : version (1), univers interne (0 à 15)
 *    sur 2 octets gros-boutiste, puis les 512 canaux. Une trame par univers utilisé, au fil de l'eau.
 */
export const BRIDGE_PROTOCOL_VERSION = 1
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

export type Hello = { protocol: number; universe: number }

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
  return {
    protocol: raw.protocol,
    universe: typeof raw.universe === 'number' ? raw.universe : 0,
  }
}

export const ackMessage = (version: string) =>
  JSON.stringify({ type: 'ack', protocol: BRIDGE_PROTOCOL_VERSION, bridge: BRIDGE_NAME, version })

export const errorMessage = (code: string, message: string) =>
  JSON.stringify({ type: 'error', code, message })
