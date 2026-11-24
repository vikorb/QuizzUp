import {
  activeLightingConfig,
  exportRoomConfig,
  parseRoomConfigImport,
  parseRoomHardwareConfig,
  withoutUnknownKeys,
} from '@hardware/config'

const NOW = new Date('2026-11-24T10:00:00.000Z')
const FTDI = { usbVendorId: 0x0403, usbProductId: 0x6001 }
const BOARD_ID = 'BBI-32 Button Box Interface (Vendor: 0483 Product: 5750)'

const room = () =>
  parseRoomHardwareConfig({
    buzzers: { source: { kind: 'gamepad', match: 'BBI', id: BOARD_ID } },
    lighting: { driver: 'usbpro', usb: FTDI },
  })

describe('identité des périphériques dans la configuration de la salle', () => {
  it('relit lighting.usb et buzzers.source.id', () => {
    const { config, problems } = room()
    expect(config.lighting.usb).toEqual(FTDI)
    expect(config.buzzers.source).toEqual({ kind: 'gamepad', match: 'BBI', id: BOARD_ID })
    expect(problems).toEqual([])
  })

  it('une configuration ancienne, sans ces clés, se charge comme avant', () => {
    const { config, problems } = parseRoomHardwareConfig({
      buzzers: { source: { kind: 'gamepad', match: 'BBI' } },
      lighting: { driver: 'usbpro' },
    })
    expect(config.lighting).not.toHaveProperty('usb')
    expect(config.buzzers.source).toEqual({ kind: 'gamepad', match: 'BBI' })
    expect(problems).toEqual([])
  })

  it.each([
    ['du texte', 'FTDI'],
    ['un nombre seul', 12],
    ['un identifiant hors plage', { usbVendorId: 0x1_0000, usbProductId: 1 }],
    ['un produit manquant', { usbVendorId: 0x0403 }],
    ['un nombre décimal', { usbVendorId: 1.5, usbProductId: 1 }],
    ['des identifiants en texte', { usbVendorId: '0403', usbProductId: '6001' }],
  ])('lighting.usb illisible (%s) est ignoré sans exception', (_name, usb) => {
    const { config, problems } = parseRoomHardwareConfig({ lighting: { driver: 'usbpro', usb } })
    expect(config.lighting).not.toHaveProperty('usb')
    expect(config.lighting.driver).toBe('usbpro')
    expect(problems).toHaveLength(1)
  })

  it('un id de manette illisible est ignoré, `match` reste', () => {
    for (const id of [42, '', '   ', 'x'.repeat(201), null]) {
      const { config } = parseRoomHardwareConfig({
        buzzers: { source: { kind: 'gamepad', match: 'BBI', id } },
      })
      expect(config.buzzers.source).toEqual({ kind: 'gamepad', match: 'BBI' })
    }
  })

  it('lighting.usb est une clé connue : la salle neuve se reconnaît et l’export la garde', () => {
    const { config } = room()
    expect(withoutUnknownKeys(config).lighting.usb).toEqual(FTDI)
  })

  it('aller-retour export puis import : lighting.usb revient identique', () => {
    const { config } = room()
    const { content } = exportRoomConfig(config, { roomName: 'Salle', now: NOW })
    expect(JSON.parse(content).config.lighting.usb).toEqual(FTDI)

    const result = parseRoomConfigImport(content)
    expect(result.ok && result.config.lighting.usb).toEqual(FTDI)
    expect(result.ok && result.problems).toEqual([])
  })

  it('buzzers.source.id n’est ni exporté ni importé : il désigne la carte de ce PC', () => {
    const { config } = room()
    const { content } = exportRoomConfig(config, { roomName: 'Salle', now: NOW })
    expect(content).not.toContain(BOARD_ID)
    expect(JSON.parse(content).config.buzzers.source).toEqual({ kind: 'gamepad', match: 'BBI' })

    // Un fichier qui en porte un (écrit à la main, ancien export) ne l'impose pas à cette salle.
    const handmade = JSON.stringify({
      format: 'quizzup-room-config',
      schema: 1,
      exportedAt: NOW.toISOString(),
      config,
    })
    const result = parseRoomConfigImport(handmade)
    expect(result.ok && result.config.buzzers.source).toEqual({ kind: 'gamepad', match: 'BBI' })
  })

  it('une salle au clavier s’exporte comme avant', () => {
    const { config } = parseRoomHardwareConfig({ buzzers: { source: { kind: 'keyboard' } } })
    const { content } = exportRoomConfig(config, { roomName: 'Salle', now: NOW })
    expect(JSON.parse(content).config.buzzers.source).toEqual({ kind: 'keyboard' })
  })

  it('lighting.usb ne passe pas au contrôleur : l’enregistrer ne relance pas les lumières', () => {
    const { config } = room()
    expect(activeLightingConfig(config)).not.toHaveProperty('usb')
    expect(activeLightingConfig(config)).toEqual(
      activeLightingConfig({ ...config, lighting: { ...config.lighting, usb: undefined } })
    )
  })
})
