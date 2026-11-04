import {
  ARTDMX_HEADER_BYTES,
  ARTNET_PORT,
  encodeArtDmx,
  formatPortAddress,
  nextSequence,
  parsePortAddress,
  portAddressFromNumber,
  portAddressToNumber,
} from '@bridge/artnet'

describe('paquet ArtDMX', () => {
  it('encode l’en-tête octet par octet', () => {
    const data = new Uint8Array(512)
    data[0] = 0xaa
    data[511] = 0x55
    const packet = encodeArtDmx({
      sequence: 7,
      physical: 2,
      address: { net: 0x12, subnet: 3, universe: 4 },
      data,
    })
    expect(ARTNET_PORT).toBe(6454)
    expect(packet.length).toBe(530)
    expect([...packet.subarray(0, ARTDMX_HEADER_BYTES)]).toEqual([
      // « Art-Net » + octet nul
      0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
      // OpCode 0x5000, petit-boutiste
      0x00, 0x50,
      // ProtVer 14, gros-boutiste
      0x00, 0x0e,
      // Sequence, Physical
      7, 2,
      // SubUni (sub 3, univers 4), Net
      0x34, 0x12,
      // Length 512, gros-boutiste
      0x02, 0x00,
    ])
    expect(packet[18]).toBe(0xaa)
    expect(packet[529]).toBe(0x55)
  })

  it('complète un univers court et borne les champs', () => {
    const packet = encodeArtDmx({
      sequence: 256 + 9,
      address: { net: 0xff, subnet: 0x1f, universe: 0x1f },
      data: new Uint8Array([1, 2, 3]),
    })
    expect(packet[12]).toBe(9)
    expect(packet[13]).toBe(0)
    expect(packet[14]).toBe(0xff)
    expect(packet[15]).toBe(0x7f)
    expect([...packet.subarray(18, 22)]).toEqual([1, 2, 3, 0])
    expect(packet.length).toBe(530)
  })

  it('fait tourner la séquence de 1 à 255 sans jamais repasser par 0', () => {
    expect(nextSequence(0)).toBe(1)
    expect(nextSequence(1)).toBe(2)
    expect(nextSequence(254)).toBe(255)
    expect(nextSequence(255)).toBe(1)
  })
})

describe('adresse de port Art-Net', () => {
  it('lit NET.SUB.UNI et l’adresse 15 bits', () => {
    expect(parsePortAddress('0.0.1')).toEqual({ net: 0, subnet: 0, universe: 1 })
    expect(parsePortAddress(' 127.15.15 ')).toEqual({ net: 127, subnet: 15, universe: 15 })
    expect(parsePortAddress('17')).toEqual({ net: 0, subnet: 1, universe: 1 })
    expect(parsePortAddress('32767')).toEqual({ net: 127, subnet: 15, universe: 15 })
    expect(parsePortAddress('0')).toEqual({ net: 0, subnet: 0, universe: 0 })
  })

  it('refuse les valeurs hors bornes ou illisibles', () => {
    for (const text of ['32768', '128.0.0', '0.16.0', '0.0.16', '0.0', 'a.b.c', '-1', '', '1.5']) {
      expect(parsePortAddress(text)).toBeNull()
    }
  })

  it('convertit dans les deux sens', () => {
    const address = { net: 5, subnet: 6, universe: 7 }
    expect(portAddressToNumber(address)).toBe(0x5_67)
    expect(portAddressFromNumber(0x5_67)).toEqual(address)
    expect(formatPortAddress(address)).toBe('5.6.7')
  })
})
