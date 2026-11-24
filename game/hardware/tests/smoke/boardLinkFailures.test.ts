import { SERIAL_CLOSE_TIMEOUT_MS } from '@hardware/dmx/serialOutput'
import { createSmokeBoardLink } from '@hardware/smoke/boardLink'

import type { FakeSmokeBoardOptions } from '../_helpers/fakeSmokeBoard'
import { advance, createFakeSmokeBoard, flush } from '../_helpers/fakeSmokeBoard'
import { createManualClock } from '../_helpers/manualClock'

/** Carte prête à lancer un jet : pause de démarrage écoulée, phase `ready` lue. */
async function ready(options: Partial<FakeSmokeBoardOptions> = {}) {
  const clock = createManualClock()
  const board = createFakeSmokeBoard({ clock, ...options })
  const link = createSmokeBoardLink({ port: board.port, clock })
  const opening = link.open()
  await advance(clock, 1000)
  expect(await opening).toBe('ready')
  await advance(clock, 4500)
  expect(link.getState().phase).toBe('ready')
  return { clock, board, link }
}

const domError = (name: string, message = name) => Object.assign(new Error(message), { name })

describe('débranchement et erreurs du port', () => {
  it('câble débranché : état débranchée, plus aucun envoi, close sans exception', async () => {
    const { clock, board, link } = await ready()
    link.drive(true)
    await advance(clock, 100)
    const count = board.received.length
    board.unplug()
    await flush()
    expect(link.getState()).toMatchObject({ status: 'disconnected', problem: 'read_error' })
    link.drive(true)
    link.drive(false)
    await advance(clock, 2000, 25, () => link.drive(true))
    expect(board.received).toHaveLength(count)
    await expect(link.close()).resolves.toBeUndefined()
    expect(link.getState().status).toBe('disconnected')
    expect(board.isOpen()).toBe(false)
    expect(board.locked()).toBe(false)
  })

  it('erreur d’écriture : état débranchée et plus aucun envoi', async () => {
    const { clock, board, link } = await ready()
    const count = board.received.length
    board.failWrites()
    link.drive(true)
    await flush()
    expect(link.getState()).toMatchObject({ status: 'disconnected', problem: 'write_error' })
    link.drive(false)
    await advance(clock, 1000)
    expect(board.received).toHaveLength(count)
    await expect(link.close()).resolves.toBeUndefined()
  })

  it('fin du flux de lecture sans fermeture : état débranchée', async () => {
    const { board, link } = await ready()
    board.endStream()
    await flush()
    expect(link.getState()).toMatchObject({ status: 'disconnected', problem: 'read_error' })
  })

  it('port impossible à ouvrir : état débranchée, aucun envoi', async () => {
    const clock = createManualClock()
    const board = createFakeSmokeBoard({ clock })
    board.port.open = async () => {
      throw domError('NetworkError', 'Failed to open serial port.')
    }
    const link = createSmokeBoardLink({ port: board.port, clock })
    expect(await link.open()).toBe('disconnected')
    expect(link.getState().problem).toBe('open_error')
    link.drive(true)
    expect(board.received).toEqual([])
    await expect(link.close()).resolves.toBeUndefined()
  })

  it('referme puis rouvre un port resté ouvert par la page', async () => {
    const clock = createManualClock()
    const board = createFakeSmokeBoard({ clock })
    await board.port.open({ baudRate: 9600 })
    const link = createSmokeBoardLink({ port: board.port, clock })
    const opening = link.open()
    await advance(clock, 1100)
    expect(await opening).toBe('ready')
    expect(board.closeCount()).toBe(1)
  })

  it('port ouvert sans flux : refermé, état débranchée', async () => {
    const clock = createManualClock()
    const board = createFakeSmokeBoard({ clock })
    Object.defineProperty(board.port, 'readable', { get: () => null })
    const link = createSmokeBoardLink({ port: board.port, clock })
    expect(await link.open()).toBe('disconnected')
    expect(link.getState().problem).toBe('open_error')
    expect(board.isOpen()).toBe(false)
    expect(board.locked()).toBe(false)
  })

  it('port resté ouvert et verrouillé par un autre lien : état débranchée', async () => {
    const clock = createManualClock()
    const board = createFakeSmokeBoard({ clock })
    const other = createSmokeBoardLink({ port: board.port, clock })
    void other.open()
    await flush()
    const link = createSmokeBoardLink({ port: board.port, clock })
    expect(await link.open()).toBe('disconnected')
  })
})

describe('fermeture', () => {
  it('envoie 0, libère les flux et ferme le port', async () => {
    const { clock, board, link } = await ready()
    link.drive(true)
    await advance(clock, 100)
    await link.close()
    expect(board.received.at(-1)!.line).toBe('0')
    expect(board.snapshot().output).toBe(false)
    expect(link.getState().status).toBe('closed')
    expect(board.isOpen()).toBe(false)
    expect(board.locked()).toBe(false)
    expect(board.closeCount()).toBe(1)
  })

  it('est sans effet la deuxième fois et plus aucun ordre ne part ensuite', async () => {
    const { board, link } = await ready()
    await link.close()
    const count = board.received.length
    await link.close()
    link.drive(true)
    expect(board.received).toHaveLength(count)
    expect(board.closeCount()).toBe(1)
  })

  it('n’envoie rien à une carte qui n’a pas donné de bannière valide', async () => {
    const clock = createManualClock()
    const board = createFakeSmokeBoard({ clock, banner: null })
    const link = createSmokeBoardLink({ port: board.port, clock })
    const opening = link.open()
    await advance(clock, 3100)
    expect(await opening).toBe('no_firmware')
    await link.close()
    expect(board.received).toEqual([])
    expect(board.isOpen()).toBe(false)
    expect(link.getState().status).toBe('no_firmware')
  })

  it('pendant la connexion : ferme sans rien envoyer', async () => {
    const clock = createManualClock()
    const board = createFakeSmokeBoard({ clock })
    const link = createSmokeBoardLink({ port: board.port, clock })
    const opening = link.open()
    await advance(clock, 500)
    await link.close()
    expect(await opening).toBe('closed')
    await advance(clock, 3000)
    expect(board.received).toEqual([])
    expect(board.isOpen()).toBe(false)
    expect(link.getState().status).toBe('closed')
  })

  it('pendant l’ouverture du port : referme le port à son retour', async () => {
    const clock = createManualClock()
    const board = createFakeSmokeBoard({ clock })
    const link = createSmokeBoardLink({ port: board.port, clock })
    const opening = link.open()
    await link.close()
    await opening
    await flush()
    expect(link.getState().status).toBe('closed')
    expect(board.isOpen()).toBe(false)
    expect(board.received).toEqual([])
  })

  it('une carte figée ne bloque pas la fermeture au-delà de 1 s', async () => {
    const { clock, board, link } = await ready()
    board.stallWrites()
    let closed = false
    const closing = link.close().then(() => {
      closed = true
    })
    await flush()
    expect(closed).toBe(false)
    await advance(clock, SERIAL_CLOSE_TIMEOUT_MS + 50)
    await closing
    expect(closed).toBe(true)
  })

  it('carte muette ou en erreur : close envoie encore 0 si le port le permet', async () => {
    const { clock, board, link } = await ready()
    board.mute(true)
    await advance(clock, 1500)
    expect(link.getState().status).toBe('silent')
    const before = board.received.filter((entry) => entry.line === '0').length
    await link.close()
    expect(board.received.filter((entry) => entry.line === '0').length).toBe(before + 1)
    expect(link.getState().status).toBe('silent')
  })
})
