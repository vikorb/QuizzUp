import {
  ackMessage,
  BRIDGE_FRAME_BYTES,
  decodeFrame,
  errorMessage,
  parseHello,
} from '@bridge/protocol'

/** Trame telle que l'encode `game/hardware` (`encodeBridgeFrame`) : même vecteur de test. */
const frame = (version: number, universe: number, first = 42) => {
  const bytes = new Uint8Array(515)
  bytes[0] = version
  bytes[1] = universe >> 8
  bytes[2] = universe & 0xff
  bytes[3] = first
  bytes[514] = 255
  return bytes
}

describe('protocole navigateur → pont', () => {
  it('décode version, univers gros-boutiste et canaux', () => {
    expect(BRIDGE_FRAME_BYTES).toBe(515)
    const decoded = decodeFrame(frame(1, 0x01_02))
    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.universe).toBe(0x01_02)
      expect(decoded.data.length).toBe(512)
      expect(decoded.data[0]).toBe(42)
      expect(decoded.data[511]).toBe(255)
    }
  })

  it('refuse une trame de mauvaise taille ou version', () => {
    expect(decodeFrame(new Uint8Array(514))).toEqual({
      ok: false,
      reason: 'trame de 514 octets, attendu 515',
    })
    expect(decodeFrame(frame(2, 0))).toEqual({ ok: false, reason: 'trame en version 2, attendu 1' })
  })

  it('lit le hello', () => {
    expect(parseHello('{"type":"hello","protocol":1,"universe":0}')).toEqual({
      protocol: 1,
      universe: 0,
    })
    expect(parseHello('{"type":"hello","protocol":3}')).toEqual({ protocol: 3, universe: 0 })
    for (const text of ['', 'null', '"hello"', '{"type":"ack","protocol":1}', '{"type":"hello"}']) {
      expect(parseHello(text)).toBeNull()
    }
  })

  it('formate ack et erreur', () => {
    expect(JSON.parse(ackMessage('1.2.3'))).toEqual({
      type: 'ack',
      protocol: 1,
      bridge: 'quizzup-artnet-bridge',
      version: '1.2.3',
      universes: 16,
    })
    expect(JSON.parse(errorMessage('universe', 'non'))).toEqual({
      type: 'error',
      code: 'universe',
      message: 'non',
    })
  })
})
