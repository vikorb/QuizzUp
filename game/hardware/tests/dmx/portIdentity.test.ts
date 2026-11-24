import type { SerialPortLike } from '@hardware/dmx/serialOutput'
import { findDmxPortByUsb, portUsbId } from '@hardware/dmx/serialOutput'

import { createFakePort, createFakeSerial } from '../_helpers/fakeSerial'

const FTDI = { usbVendorId: 0x0403, usbProductId: 0x6001 }
const CH340 = { usbVendorId: 0x1a86, usbProductId: 0x7523 }
const UNO = { usbVendorId: 0x2341, usbProductId: 0x0043 }

const portWith = (info?: { usbVendorId: number; usbProductId: number }): SerialPortLike => {
  const { port } = createFakePort()
  if (info) {
    port.getInfo = () => info
  }
  return port
}

/** Toutes les façons de lister les mêmes ports : l'ordre de `getPorts()` ne doit rien changer. */
const orders = <T>(items: T[]): T[][] =>
  items.length <= 1
    ? [items]
    : items.flatMap((item, index) =>
        orders([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest])
      )

describe('interface DMX retrouvée par son identité USB (lighting.usb)', () => {
  it('lit fabricant et produit, rien d’autre', () => {
    expect(portUsbId(portWith(FTDI))).toEqual(FTDI)
    expect(portUsbId(portWith())).toBeNull()
    const partial = portWith()
    partial.getInfo = () => ({ usbVendorId: 0x0403 })
    expect(portUsbId(partial)).toBeNull()
  })

  it('prend le port du modèle retenu, quel que soit l’ordre de branchement', async () => {
    const ftdi = portWith(FTDI)
    const ch340 = portWith(CH340)
    const uno = portWith(UNO)
    for (const ports of orders([ftdi, ch340, uno])) {
      expect(await findDmxPortByUsb(createFakeSerial(ports), CH340)).toEqual({
        status: 'found',
        port: ch340,
      })
    }
  })

  it('ne prend jamais un autre modèle, même une puce DMX connue', async () => {
    const serial = createFakeSerial([portWith(FTDI), portWith(UNO), portWith()])
    expect(await findDmxPortByUsb(serial, CH340)).toEqual({ status: 'absent' })
    expect(await findDmxPortByUsb(createFakeSerial([]), CH340)).toEqual({ status: 'absent' })
    expect(await findDmxPortByUsb(null, CH340)).toEqual({ status: 'absent' })
    // Même fabricant, autre produit : un autre modèle.
    const ft232h = portWith({ usbVendorId: 0x0403, usbProductId: 0x6014 })
    expect(await findDmxPortByUsb(createFakeSerial([ft232h]), FTDI)).toEqual({ status: 'absent' })
  })

  it('deux interfaces identiques : aucune n’est choisie, quel que soit l’ordre', async () => {
    const first = portWith(FTDI)
    const second = portWith(FTDI)
    for (const ports of orders([first, second, portWith(UNO)])) {
      const choice = await findDmxPortByUsb(createFakeSerial(ports), FTDI)
      expect(choice.status).toBe('ambiguous')
      expect(choice.status === 'ambiguous' && new Set(choice.ports)).toEqual(
        new Set([first, second])
      )
    }
  })

  describe('la carte de la fumée n’est jamais ouverte en DMX', () => {
    it('est écartée du choix : un autre port du même modèle n’est pas ambigu avec elle', async () => {
      const board = portWith(UNO)
      const clone = portWith(UNO)
      // Exclusion par l'objet port : l'autre exemplaire du même modèle reste seul candidat.
      expect(
        await findDmxPortByUsb(createFakeSerial([board, clone]), UNO, { exclude: { port: board } })
      ).toEqual({
        status: 'found',
        port: clone,
      })
    })

    it('identité retenue égale à celle de la carte : refus signalé, aucun port rendu', async () => {
      const board = portWith(UNO)
      const serial = createFakeSerial([portWith(FTDI), board])
      expect(await findDmxPortByUsb(serial, UNO, { exclude: { usb: UNO } })).toEqual({
        status: 'excluded',
      })
      // Sans exclusion, le même appel l'ouvrirait : c'est bien l'exclusion qui protège.
      expect(await findDmxPortByUsb(serial, UNO)).toEqual({ status: 'found', port: board })
    })

    it('deux cartes du modèle exclu : aucune n’est ni choisie ni jugée ambiguë', async () => {
      const serial = createFakeSerial([portWith(UNO), portWith(UNO)])
      expect(await findDmxPortByUsb(serial, UNO, { exclude: { usb: UNO } })).toEqual({
        status: 'excluded',
      })
    })

    it('une autre interface reste choisie quand la carte est branchée avec', async () => {
      const ftdi = portWith(FTDI)
      const serial = createFakeSerial([portWith(UNO), ftdi])
      expect(await findDmxPortByUsb(serial, FTDI, { exclude: { usb: UNO } })).toEqual({
        status: 'found',
        port: ftdi,
      })
    })
  })
})
