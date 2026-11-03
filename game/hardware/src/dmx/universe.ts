/** Un univers DMX : 512 canaux (adresses 1 à 512), valeurs 0-255. */
export const DMX_CHANNELS = 512

export function createUniverse(): Uint8Array {
  return new Uint8Array(DMX_CHANNELS)
}

/**
 * Trame « DMX USB Pro » (Enttec et clones compatibles), message 6 « Output Only Send DMX » :
 * 0x7E, label 6, longueur (start code + 512 canaux) LSB/MSB, start code 0, données, 0xE7.
 */
export function encodeUsbProFrame(universe: Uint8Array): Uint8Array {
  const length = DMX_CHANNELS + 1
  const packet = new Uint8Array(length + 5)
  packet[0] = 0x7e
  packet[1] = 0x06
  packet[2] = length & 0xff
  packet[3] = (length >> 8) & 0xff
  packet[4] = 0x00
  packet.set(universe.subarray(0, DMX_CHANNELS), 5)
  packet[packet.length - 1] = 0xe7
  return packet
}

/** Trame DMX brute (interfaces « Open DMX » FTDI) : start code 0 puis les 512 canaux. */
export function encodeRawDmxFrame(universe: Uint8Array): Uint8Array {
  const packet = new Uint8Array(DMX_CHANNELS + 1)
  packet.set(universe.subarray(0, DMX_CHANNELS), 1)
  return packet
}
