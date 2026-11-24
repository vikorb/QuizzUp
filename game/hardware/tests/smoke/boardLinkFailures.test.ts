import { SERIAL_CLOSE_TIMEOUT_MS } from '@hardware/dmx/serialOutput'
import { createSmokeBoardLink } from '@hardware/smoke/boardLink'

import type { FakeSmokeBoardOptions } from '../_helpers/fakeSmokeBoard'
import {
  advance,
  createFakeSmokeBoard,
  FAKE_BOARD_BANNER,
  FAKE_BOARD_WARM_MS,
  flush,
} from '../_helpers/fakeSmokeBoard'
import { createManualClock } from '../_helpers/manualClock'

/** Carte prête à lancer un jet : pause de démarrage écoulée, phase `ready` lue. */
async function ready(options: Partial<FakeSmokeBoardOptions> = {}) {
  const clock = createManualClock()
  const board = createFakeSmokeBoard({ clock, ...options })
  const link = createSmokeBoardLink({ port: board.port, clock })
  const opening = link.open()
  await advance(clock, 1000)
  expect(await opening).toBe('ready')
  await advance(clock, FAKE_BOARD_WARM_MS)
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
    // La lecture est perdue mais pas l'écriture : un dernier 0 part avant d'abandonner le port.
    expect(board.received.at(-1)?.line).toBe('0')
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

describe('erreurs de lecture', () => {
  it('erreur passagère (FramingError) : la lecture reprend sur le flux neuf, le lien reste prêt', async () => {
    const { clock, board, link } = await ready()
    board.failRead('FramingError')
    await flush()
    expect(link.getState().status).toBe('ready')
    // Si la lecture était morte, la carte semblerait muette : on laisse passer plus d'une seconde.
    await advance(clock, 2000)
    expect(link.getState().status).toBe('ready')
    expect(board.locked()).toBe(true)
    link.drive(true)
    await advance(clock, 200)
    expect(link.getState()).toMatchObject({ status: 'ready', phase: 'fire' })
  })

  it.each(['ParityError', 'BufferOverrunError', 'BreakError'])(
    'erreur passagère %s : reprise elle aussi',
    async (name) => {
      const { clock, board, link } = await ready()
      board.failRead(name)
      await flush()
      await advance(clock, 1500)
      expect(link.getState().status).toBe('ready')
    }
  )

  it('erreurs passagères en boucle sans une ligne lue : carte perdue après trois reprises', async () => {
    const { board, link } = await ready()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      board.failRead('FramingError')
      await flush()
      expect(link.getState().status).toBe('ready')
    }
    board.failRead('FramingError')
    await flush()
    expect(link.getState()).toMatchObject({ status: 'disconnected', problem: 'read_error' })
  })

  it('une ligne lue remet le compte des erreurs passagères à zéro', async () => {
    const { clock, board, link } = await ready()
    for (let round = 0; round < 3; round += 1) {
      board.failRead('FramingError')
      await flush()
      board.failRead('FramingError')
      await flush()
      // Un H de présence part et sa réponse est lue.
      await advance(clock, 400)
    }
    expect(link.getState().status).toBe('ready')
  })

  it('autre erreur de lecture : carte perdue, un dernier 0 part avant d’abandonner le port', async () => {
    const { board, link } = await ready()
    board.failRead('NetworkError')
    await flush()
    expect(link.getState()).toMatchObject({ status: 'disconnected', problem: 'read_error' })
    expect(board.received.at(-1)?.line).toBe('0')
  })

  it('un flux perdu en cours de jet : le 0 de dernier recours coupe la carte', async () => {
    const { clock, board, link } = await ready()
    link.drive(true)
    await advance(clock, 100)
    expect(board.snapshot().output).toBe(true)
    board.endStream()
    await flush()
    expect(board.snapshot()).toMatchObject({ output: false, cause: 'CMD' })
  })
})

type Context = Awaited<ReturnType<typeof ready>>

describe('état exposé après une sortie de `ready`', () => {
  const stateAfter = async (leave: (context: Context) => Promise<void>) => {
    const context = await ready()
    // Une ligne d'état et une phase sont lues avant la sortie.
    expect(context.link.getState()).toMatchObject({ phase: 'ready', board: { state: 'READY' } })
    await leave(context)
    return context.link.getState()
  }

  const leaves: [string, string, (context: Context) => void][] = [
    ['câble débranché', 'disconnected', ({ board }) => board.unplug()],
    ['carte muette', 'silent', ({ board }) => board.mute(true)],
    [
      'carte qui redémarre',
      'fault',
      ({ board }) =>
        board.inject(`${FAKE_BOARD_BANNER}
`),
    ],
  ]

  it.each(leaves)('%s : plus de phase ni de ligne d’état périmée', async (_name, status, leave) => {
    const state = await stateAfter(async (context) => {
      leave(context)
      await advance(context.clock, 1500)
    })
    expect(state.status).toBe(status)
    expect(state).toMatchObject({ board: null, phase: null })
  })

  it('fermeture : plus de phase ni de ligne d’état périmée', async () => {
    const state = await stateAfter(async ({ clock, link }) => {
      const closing = link.close()
      await advance(clock, 100)
      await closing
    })
    expect(state).toMatchObject({ status: 'closed', board: null, phase: null })
  })
})

describe('ouverture répétée', () => {
  it('un second open() pendant la connexion rend la première ouverture, sans en lancer une autre', async () => {
    const clock = createManualClock()
    const board = createFakeSmokeBoard({ clock })
    const openSpy = vi.spyOn(board.port, 'open')
    const link = createSmokeBoardLink({ port: board.port, clock })
    const first = link.open()
    const second = link.open()
    expect(second).toBe(first)
    await advance(clock, 1000)
    expect(await first).toBe('ready')
    expect(await second).toBe('ready')
    expect(openSpy).toHaveBeenCalledTimes(1)
    // Une fois connecté, open() rend l'état courant.
    expect(await link.open()).toBe('ready')
    expect(openSpy).toHaveBeenCalledTimes(1)
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
    // Les écritures bloquées sont abandonnées : les flux sont rendus et le port fermé quand même.
    expect(board.isOpen()).toBe(false)
    expect(board.locked()).toBe(false)
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
