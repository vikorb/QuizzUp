/**
 * Encodage Art-Net 4 (Artistic Licence), limité aux paquets dont le pont a besoin : **ArtDMX**
 * (OpCode 0x5000, envoi d'un univers DMX à un nœud), puis **ArtPoll** (0x2000, recherche des
 * nœuds) et **ArtPollReply** (0x2100, leur réponse, en lecture seule), décrits plus bas.
 *
 * | Octet | Champ        | Valeur                                                    |
 * | ----- | ------------ | --------------------------------------------------------- |
 * | 0-7   | ID           | « Art-Net » suivi d'un octet nul                          |
 * | 8-9   | OpCode       | 0x5000, petit-boutiste (0x00 0x50)                        |
 * | 10-11 | ProtVer      | 14, gros-boutiste (0x00 0x0E)                             |
 * | 12    | Sequence     | 1-255 (0 = séquencement désactivé)                        |
 * | 13    | Physical     | port physique d'entrée, informatif (0)                    |
 * | 14    | SubUni       | sous-réseau (4 bits hauts) et univers (4 bits bas)        |
 * | 15    | Net          | réseau (7 bits)                                           |
 * | 16-17 | Length       | nombre de canaux, gros-boutiste, pair, 2-512 (ici 512)    |
 * | 18-   | Data         | valeurs des canaux                                        |
 */
export const ARTNET_PORT = 6454
export const ARTNET_ID = 'Art-Net\0'
export const ARTNET_OPCODE_DMX = 0x50_00
export const ARTNET_PROTOCOL_VERSION = 14
export const ARTDMX_HEADER_BYTES = 18
export const DMX_CHANNELS = 512
export const ARTNET_OPCODE_POLL = 0x20_00
export const ARTNET_OPCODE_POLL_REPLY = 0x21_00

/** Adresse de port Art-Net 15 bits : Net (0-127) . Sub-Net (0-15) . Universe (0-15). */
export type PortAddress = { net: number; subnet: number; universe: number }

export const PORT_ADDRESS_MAX = 0x7f_ff

export function portAddressToNumber(address: PortAddress): number {
  return (address.net << 8) | (address.subnet << 4) | address.universe
}

export function portAddressFromNumber(value: number): PortAddress {
  return { net: (value >> 8) & 0x7f, subnet: (value >> 4) & 0x0f, universe: value & 0x0f }
}

export function formatPortAddress(address: PortAddress): string {
  return `${address.net}.${address.subnet}.${address.universe}`
}

const isIntegerIn = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max

/**
 * Lit une adresse de port : `net.sub.uni` (ex. `0.0.1`) ou un nombre 0-32767 (adresse 15 bits,
 * ex. `17` = `0.1.1`). Renvoie `null` si la valeur est invalide.
 */
export function parsePortAddress(input: string): PortAddress | null {
  const text = input.trim()
  if (/^\d+$/.test(text)) {
    const value = Number(text)
    return isIntegerIn(value, 0, PORT_ADDRESS_MAX) ? portAddressFromNumber(value) : null
  }
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(text)
  if (!parts) {
    return null
  }
  const [net, subnet, universe] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  if (!isIntegerIn(net, 0, 127) || !isIntegerIn(subnet, 0, 15) || !isIntegerIn(universe, 0, 15)) {
    return null
  }
  return { net, subnet, universe }
}

export type ArtDmxPacket = {
  /** 1-255 ; 0 désactive le réordonnancement côté nœud. */
  sequence: number
  physical?: number
  address: PortAddress
  /** Canaux 1-512 ; complété par des zéros s'il est plus court. */
  data: Uint8Array
}

/** Construit un paquet ArtDMX complet (18 octets d'en-tête + 512 canaux). */
export function encodeArtDmx(packet: ArtDmxPacket): Buffer {
  const buffer = Buffer.alloc(ARTDMX_HEADER_BYTES + DMX_CHANNELS)
  buffer.write(ARTNET_ID, 0, 'latin1')
  buffer.writeUInt16LE(ARTNET_OPCODE_DMX, 8)
  buffer.writeUInt16BE(ARTNET_PROTOCOL_VERSION, 10)
  buffer[12] = packet.sequence & 0xff
  buffer[13] = (packet.physical ?? 0) & 0xff
  buffer[14] = ((packet.address.subnet & 0x0f) << 4) | (packet.address.universe & 0x0f)
  buffer[15] = packet.address.net & 0x7f
  buffer.writeUInt16BE(DMX_CHANNELS, 16)
  buffer.set(packet.data.subarray(0, DMX_CHANNELS), ARTDMX_HEADER_BYTES)
  return buffer
}

/** Numéro de séquence suivant : 1, 2… 255, 1… (0 est réservé à « pas de séquence »). */
export const nextSequence = (sequence: number) => (sequence >= 255 ? 1 : sequence + 1)

/**
 * **ArtPoll** (14 octets) : le contrôleur demande aux nœuds de se présenter.
 *
 * | Octet | Champ        | Valeur                                                          |
 * | ----- | ------------ | --------------------------------------------------------------- |
 * | 0-7   | ID           | « Art-Net » suivi d'un octet nul                                |
 * | 8-9   | OpCode       | 0x2000, petit-boutiste (0x00 0x20)                              |
 * | 10-11 | ProtVer      | 14, gros-boutiste (0x00 0x0E)                                   |
 * | 12    | Flags        | 0 : réponse seulement à ce poll (pas de réponse spontanée)      |
 * | 13    | DiagPriority | 0 (pas de diagnostic demandé)                                   |
 */
export const ARTPOLL_BYTES = 14

export function encodeArtPoll(): Buffer {
  const buffer = Buffer.alloc(ARTPOLL_BYTES)
  buffer.write(ARTNET_ID, 0, 'latin1')
  buffer.writeUInt16LE(ARTNET_OPCODE_POLL, 8)
  buffer.writeUInt16BE(ARTNET_PROTOCOL_VERSION, 10)
  return buffer
}

/**
 * **ArtPollReply** : seuls les champs lus sont listés (le paquet complet fait 239 octets en Art-Net 4,
 * un nœud ancien en envoie moins : on exige ceux qui vont jusqu'à `SwOut`).
 *
 * | Octet   | Champ      | Lecture                                                              |
 * | ------- | ---------- | -------------------------------------------------------------------- |
 * | 0-9     | ID, OpCode | « Art-Net » + octet nul, puis 0x2100 petit-boutiste (0x00 0x21)      |
 * | 10-13   | IP         | adresse IPv4 du nœud                                                 |
 * | 18      | NetSwitch  | bits 0-6 : Net des ports                                             |
 * | 19      | SubSwitch  | bits 0-3 : Sub-Net des ports                                         |
 * | 26-43   | ShortName  | 18 octets, texte terminé par un octet nul                            |
 * | 44-107  | LongName   | 64 octets, texte terminé par un octet nul                            |
 * | 172-173 | NumPorts   | gros-boutiste, 0 à 4 (les ports au-delà du 4e passent par BindIndex) |
 * | 174-177 | PortTypes  | bit 7 : le port sort du DMX (sortie)                                 |
 * | 190-193 | SwOut      | bits 0-3 : univers du port de sortie                                 |
 */
export const ARTPOLLREPLY_MIN_BYTES = 194

export type ArtNode = {
  ip: string
  shortName: string
  longName: string
  /** Univers de sortie (`net.sub.uni`) ; absent si le nœud n'annonce aucune sortie. */
  universes?: string[]
}

const cString = (buffer: Uint8Array, start: number, length: number) => {
  const field = buffer.subarray(start, start + length)
  const end = field.indexOf(0)
  return Buffer.from(end === -1 ? field : field.subarray(0, end))
    .toString('latin1')
    .trim()
}

/** Lit un ArtPollReply ; `null` pour tout paquet qui n'en est pas un (ou trop court), sans exception. */
export function decodeArtPollReply(message: Uint8Array): ArtNode | null {
  if (
    message.length < ARTPOLLREPLY_MIN_BYTES ||
    Buffer.from(message.subarray(0, 8)).toString('latin1') !== ARTNET_ID
  ) {
    return null
  }
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength)
  if (view.getUint16(8, true) !== ARTNET_OPCODE_POLL_REPLY) {
    return null
  }
  const net = message[18]! & 0x7f
  const subnet = message[19]! & 0x0f
  const ports = Math.min(view.getUint16(172, false), 4)
  const universes: string[] = []
  for (let port = 0; port < ports; port += 1) {
    if (message[174 + port]! & 0x80) {
      const universe = formatPortAddress({ net, subnet, universe: message[190 + port]! & 0x0f })
      if (!universes.includes(universe)) {
        universes.push(universe)
      }
    }
  }
  return {
    ip: `${message[10]}.${message[11]}.${message[12]}.${message[13]}`,
    shortName: cString(message, 26, 18),
    longName: cString(message, 44, 64),
    ...(universes.length > 0 ? { universes } : {}),
  }
}
