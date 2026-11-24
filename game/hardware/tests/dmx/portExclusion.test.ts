import type { SerialPortLike } from '@hardware/dmx/serialOutput'
import {
  describePort,
  DMX_USB_VENDOR_IDS,
  getGrantedDmxPort,
  watchDmxPortReconnection,
} from '@hardware/dmx/serialOutput'

import { createFakePort, createFakeSerial } from '../_helpers/fakeSerial'

const UNO = { usbVendorId: 0x2341, usbProductId: 0x0043 }
const CLONE_UNO = { usbVendorId: 0x2a03, usbProductId: 0x0043 }
const FTDI = { usbVendorId: 0x0403, usbProductId: 0x6001 }

const portWith = (info?: { usbVendorId: number; usbProductId: number }): SerialPortLike => {
  const { port } = createFakePort()
  if (info) {
    port.getInfo = () => info
  }
  return port
}

describe('port DMX USB : la carte de la fumée est exclue du choix automatique', () => {
  it('l’identifiant 0x2A03 est un fabricant connu, décrit comme Arduino', () => {
    expect(DMX_USB_VENDOR_IDS).toContain(0x2a03)
    expect(describePort(portWith(CLONE_UNO))).toBe('Arduino 2a03:0043')
  })

  it('sans match, ne prend pas la carte même si elle est listée la première et d’un fabricant connu', async () => {
    const board = portWith(UNO)
    const ftdi = portWith(FTDI)
    const serial = createFakeSerial([board, ftdi])
    // Sans exclusion, le premier port d'un fabricant connu est la carte : le défaut corrigé ici.
    expect(await getGrantedDmxPort(serial)).toBe(board)
    expect(await getGrantedDmxPort(serial, { exclude: { port: board } })).toBe(ftdi)
  })

  it('exclut aussi par identifiant USB : après un rechargement, le navigateur rend un autre objet', async () => {
    const reloadedBoard = portWith(UNO)
    const ftdi = portWith(FTDI)
    const exclude = { usb: UNO }
    expect(await getGrantedDmxPort(createFakeSerial([reloadedBoard, ftdi]), { exclude })).toBe(ftdi)
  })

  it('n’ouvre jamais la carte à défaut d’autre interface : aucun port plutôt que la carte', async () => {
    const board = portWith(UNO)
    expect(await getGrantedDmxPort(createFakeSerial([board]), { exclude: { usb: UNO } })).toBeNull()
    expect(
      await getGrantedDmxPort(createFakeSerial([board]), { exclude: { port: board } })
    ).toBeNull()
  })

  it('le fabricant 0x2A03 est exclu comme les autres : seul l’identifiant enregistré compte', async () => {
    const clone = portWith(CLONE_UNO)
    const ftdi = portWith(FTDI)
    const serial = createFakeSerial([clone, ftdi])
    expect(await getGrantedDmxPort(serial, { exclude: { usb: CLONE_UNO } })).toBe(ftdi)
    // Un autre modèle (même produit chez un autre fabricant) n'est pas exclu.
    expect(await getGrantedDmxPort(serial, { exclude: { usb: UNO } })).toBe(clone)
  })

  it('avec match, la carte n’est jamais reprise, même si c’est le même modèle que l’interface mémorisée', async () => {
    const dmx = portWith(UNO)
    const board = portWith(UNO)
    const serial = createFakeSerial([board])
    expect(await getGrantedDmxPort(serial, { match: dmx })).toBe(board)
    expect(await getGrantedDmxPort(serial, { match: dmx, exclude: { port: board } })).toBeNull()
    expect(await getGrantedDmxPort(serial, { match: dmx, exclude: { usb: UNO } })).toBeNull()
  })

  it('avec une exclusion vide, le choix ne change pas', async () => {
    const board = portWith(UNO)
    const ftdi = portWith(FTDI)
    const serial = createFakeSerial([board, ftdi])
    expect(await getGrantedDmxPort(serial, { exclude: {} })).toBe(board)
    expect(await getGrantedDmxPort(serial, { exclude: { port: null, usb: null } })).toBe(board)
  })

  it('un port sans informations USB n’est exclu que s’il est le même objet', async () => {
    const board = portWith()
    const other = portWith()
    const serial = createFakeSerial([board, other])
    expect(await getGrantedDmxPort(serial, { exclude: { port: board, usb: UNO } })).toBe(other)
  })

  it('le rebranchement de la carte ne fait pas rouvrir la sortie DMX', () => {
    const serial = createFakeSerial([])
    const board = portWith(UNO)
    const ftdi = portWith(FTDI)
    const onReconnect = vi.fn()
    watchDmxPortReconnection({ serial, exclude: { usb: UNO }, onReconnect })
    serial.emit('connect', board)
    expect(onReconnect).not.toHaveBeenCalled()
    serial.emit('connect', ftdi)
    expect(onReconnect).toHaveBeenCalledWith(ftdi)
  })
})
