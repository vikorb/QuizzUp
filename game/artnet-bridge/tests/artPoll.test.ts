import { decodeArtPollReply, encodeArtPoll } from '@bridge/artnet'

import { buildPollReply } from './_helpers/artPollReply'

describe('paquet ArtPoll', () => {
  it('encode les 14 octets de la spécification', () => {
    expect([...encodeArtPoll()]).toEqual([
      // « Art-Net » + octet nul
      0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
      // OpCode 0x2000, petit-boutiste
      0x00, 0x20,
      // ProtVer 14, gros-boutiste
      0x00, 0x0e,
      // Flags, DiagPriority
      0x00, 0x00,
    ])
  })
})

describe('paquet ArtPollReply', () => {
  it('lit l’IP, les noms et les univers de sortie d’un nœud à 2 sorties', () => {
    const reply = buildPollReply({
      ip: '192.168.1.50',
      shortName: 'NET-3',
      longName: 'Showtec NET-3 Art-Net node',
      net: 0,
      subnet: 1,
      ports: [
        { type: 0x80, swOut: 0 }, // sortie DMX, univers 0
        { type: 0x80, swOut: 5 }, // sortie DMX, univers 5
        { type: 0x40, swOut: 7 }, // entrée DMX : ignorée
      ],
    })
    expect(decodeArtPollReply(reply)).toEqual({
      ip: '192.168.1.50',
      shortName: 'NET-3',
      longName: 'Showtec NET-3 Art-Net node',
      universes: ['0.1.0', '0.1.5'],
    })
  })

  it('omet les univers quand il n’y a aucune sortie, et accepte un paquet ancien de 207 octets', () => {
    const reply = buildPollReply({ ip: '10.0.0.7', shortName: 'In only' }, 207)
    expect(decodeArtPollReply(reply)).toEqual({
      ip: '10.0.0.7',
      shortName: 'In only',
      longName: 'Node long name',
    })
  })

  it('lit un nom de 18 octets sans octet nul et borne NumPorts à 4', () => {
    const reply = buildPollReply({
      ip: '10.0.0.8',
      shortName: 'ABCDEFGHIJKLMNOPQR',
      net: 0xff,
      subnet: 0xf3,
      ports: [{ type: 0x80, swOut: 0x1f }],
    })
    reply.writeUInt16BE(9, 172) // NumPorts 9 : seuls 4 ports existent
    const node = decodeArtPollReply(reply)
    expect(node?.shortName).toBe('ABCDEFGHIJKLMNOPQR')
    expect(node?.universes).toEqual(['127.3.15'])
  })

  it('retire les caractères de contrôle des noms (ESC, BEL, retour chariot, C1)', () => {
    const reply = buildPollReply({
      ip: '10.0.0.8',
      shortName: 'A\x1b[31mB\x07C',
      longName: 'Ligne1\r\nLigne2\x85\x7f fin',
    })
    const node = decodeArtPollReply(reply)
    expect(node?.shortName).toBe('A[31mBC')
    expect(node?.longName).toBe('Ligne1Ligne2 fin')
  })

  it('ignore sans exception les paquets malformés', () => {
    const good = buildPollReply({ ip: '10.0.0.9', ports: [{ type: 0x80, swOut: 1 }] })
    const wrongId = Buffer.from(good)
    wrongId.write('Art-Nex\0', 0, 'latin1')
    const noNul = Buffer.from(good)
    noNul[7] = 0x20
    const wrongOpcode = Buffer.from(good)
    wrongOpcode.writeUInt16LE(0x5000, 8)
    const artPollEchoed = Buffer.from(good)
    artPollEchoed.writeUInt16LE(0x2000, 8)

    for (const bad of [
      Buffer.alloc(0),
      Buffer.from('Art-Net\0'),
      good.subarray(0, 193),
      wrongId,
      noNul,
      wrongOpcode,
      artPollEchoed,
      Buffer.alloc(300, 0xff),
      encodeArtPoll(),
    ]) {
      expect(decodeArtPollReply(bad)).toBeNull()
    }
    expect(decodeArtPollReply(good.subarray(0, 194))).not.toBeNull()
  })
})
