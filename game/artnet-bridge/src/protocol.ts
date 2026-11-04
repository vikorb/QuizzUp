import { DMX_CHANNELS } from './artnet.js'

/**
 * Protocole écran de salle → pont, version 1. Miroir de `game/hardware/src/dmx/bridgeOutput.ts`
 * (les deux côtés sont testés octet par octet sur le même format).
 *
 * 1. Le navigateur envoie un message **texte** `{"type":"hello","protocol":1,"universe":0}`.
 * 2. Le pont répond `{"type":"ack","protocol":1,"bridge":"quizzup-artnet-bridge","version":"…"}`
 *    ou `{"type":"error","code":"…","message":"…"}` puis ferme.
 * 3. Chaque trame est un message **binaire** de 515 octets : version (1), univers interne sur
 *    2 octets gros-boutiste, puis les 512 canaux.
 */
export const BRIDGE_PROTOCOL_VERSION = 1
export const BRIDGE_FRAME_HEADER_BYTES = 3
export const BRIDGE_FRAME_BYTES = BRIDGE_FRAME_HEADER_BYTES + DMX_CHANNELS
export const BRIDGE_NAME = 'quizzup-artnet-bridge'

/** Le pont v1 ne traite qu'un univers interne : le 0 (le champ prépare l'évolution). */
export const SUPPORTED_INTERNAL_UNIVERSE = 0

/** Codes de fermeture WebSocket propres au pont (plage 4000-4999 réservée aux applications). */
export const CLOSE_CODES = {
  helloExpected: 4000,
  protocol: 4001,
  universe: 4002,
  badFrame: 4003,
} as const

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
    universe: typeof raw.universe === 'number' ? raw.universe : SUPPORTED_INTERNAL_UNIVERSE,
  }
}

export const ackMessage = (version: string) =>
  JSON.stringify({ type: 'ack', protocol: BRIDGE_PROTOCOL_VERSION, bridge: BRIDGE_NAME, version })

export const errorMessage = (code: string, message: string) =>
  JSON.stringify({ type: 'error', code, message })
