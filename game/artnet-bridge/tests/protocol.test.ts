import {
  ackMessage,
  BRIDGE_FRAME_BYTES,
  checkArtnetRequest,
  decodeFrame,
  errorMessage,
  isAllowedArtnetTarget,
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
      version: 1,
    })
    expect(parseHello('{"type":"hello","protocol":3}')).toEqual({
      protocol: 3,
      universe: 0,
      version: 1,
    })
    for (const text of ['', 'null', '"hello"', '{"type":"ack","protocol":1}', '{"type":"hello"}']) {
      expect(parseHello(text)).toBeNull()
    }
  })

  it('formate ack et erreur', () => {
    expect(JSON.parse(ackMessage('1.2.3', { target: null, port: 6454, source: 'none' }))).toEqual({
      type: 'ack',
      protocol: 1,
      bridge: 'quizzup-artnet-bridge',
      version: '1.2.3',
      universes: 16,
      features: ['poll'],
      artnet: { target: null, port: 6454, source: 'none' },
    })
    expect(JSON.parse(errorMessage('universe', 'non'))).toEqual({
      type: 'error',
      code: 'universe',
      message: 'non',
    })
  })
})

describe('protocole v2 : cible Art-Net', () => {
  it('lit la version et la cible du hello v2, ignorées en v1 ; le port reçu est écarté', () => {
    const artnet = { target: '192.168.1.50' }
    expect(parseHello(JSON.stringify({ type: 'hello', protocol: 1, version: 2, artnet }))).toEqual({
      protocol: 1,
      universe: 0,
      version: 2,
      artnet,
    })
    expect(
      parseHello(
        JSON.stringify({ type: 'hello', protocol: 1, version: 2, artnet: { ...artnet, port: 53 } })
      )?.artnet
    ).toEqual(artnet)
    expect(
      parseHello(JSON.stringify({ type: 'hello', protocol: 1, artnet }))?.artnet
    ).toBeUndefined()
    expect(
      parseHello('{"type":"hello","protocol":1,"version":2,"artnet":"x"}')?.artnet
    ).toBeUndefined()
  })

  it('accepte les réseaux privés, link-local et boucle locale', () => {
    for (const ip of [
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.50',
      '192.168.1.255',
      '169.254.10.20',
      '127.0.0.1',
    ]) {
      expect(isAllowedArtnetTarget(ip), ip).toBe(true)
    }
  })

  it('refuse les adresses publiques et les valeurs invalides', () => {
    for (const ip of [
      '8.8.8.8',
      '1.1.1.1',
      '172.15.0.1',
      '172.32.0.1',
      '192.169.1.1',
      '169.253.0.1',
      '11.0.0.1',
      '255.255.255.255',
      '192.168.1.300',
      '192.168.01.1',
      '::1',
      'salle.local',
      '',
      // Formes exotiques que certains systèmes résolvent vers une adresse locale ou privée.
      '127.1',
      '0x7f.1',
      '0x7f.0.0.1',
      '2130706433',
      '::ffff:10.0.0.1',
      ' 10.0.0.1',
      '10.0.0.1 ',
      '10.0.0.1.evil',
      '10.0.0.1/8',
      '10.0.0.1:6454',
    ]) {
      expect(isAllowedArtnetTarget(ip), ip).toBe(false)
    }
  })

  it('valide la demande complète avec un message lisible', () => {
    expect(checkArtnetRequest({ target: '10.0.0.5' })).toEqual({ ok: true, target: '10.0.0.5' })
    // Le port n'est plus une affaire de l'écran de salle : il est ignoré, jamais relayé.
    expect(checkArtnetRequest({ target: '10.0.0.5', port: 53 } as never)).toEqual({
      ok: true,
      target: '10.0.0.5',
    })
    expect(checkArtnetRequest({ target: '8.8.8.8' })).toMatchObject({
      ok: false,
      message: expect.stringContaining('8.8.8.8 refusée') as string,
    })
    expect(checkArtnetRequest({ target: 12 })).toMatchObject({ ok: false })
  })

  it('l’ack annonce toujours la cible effective', () => {
    expect(
      JSON.parse(ackMessage('1.2.3', { target: '10.0.0.5', port: 6454, source: 'room' })).artnet
    ).toEqual({ target: '10.0.0.5', port: 6454, source: 'room' })
  })
})
