import { createFakeOptiboot, type OptibootOptions } from '../_helpers/fakeOptiboot'
import { createManualClock, flushPromises } from '../_helpers/manualClock'

/**
 * Le client est testé contre cet émulateur : s'il pardonnait ce qu'Optiboot ne pardonne pas, un
 * client faux passerait. Ces tests parlent à l'émulateur sans passer par le client.
 */

const STK_OK = 0x10
const STK_INSYNC = 0x14
const CRC_EOP = 0x20

const page = (seed: number) => Uint8Array.from({ length: 128 }, (_value, index) => seed + index)

async function openBoard(extra: Partial<OptibootOptions> = {}) {
  const clock = createManualClock()
  const board = createFakeOptiboot({ clock, ...extra })
  await board.port.open({ baudRate: 115_200 })
  const reader = board.port.readable!.getReader()
  const writer = board.port.writable!.getWriter()
  await board.port.setSignals!({ dataTerminalReady: false })
  await board.port.setSignals!({ dataTerminalReady: true })
  const send = async (bytes: ArrayLike<number>) => {
    await writer.write(Uint8Array.from(bytes))
    await flushPromises()
  }
  /** Envoie une commande et lit sa réponse (`STK_INSYNC`, `dataLength` octets, `STK_OK`). */
  const talk = async (bytes: ArrayLike<number>, dataLength = 0) => {
    await send(bytes)
    const reply: number[] = []
    while (reply.length < dataLength + 2) {
      reply.push(...(await reader.read()).value!)
    }
    expect(reply[0]).toBe(STK_INSYNC)
    expect(reply.at(-1)).toBe(STK_OK)
    return reply.slice(1, -1)
  }
  return { clock, board, send, talk }
}

const loadAddress = (byteAddress: number) => [
  0x55,
  (byteAddress / 2) & 0xff,
  (byteAddress / 2) >> 8,
  CRC_EOP,
]
const progPage = (data: Uint8Array, memtype = 0x46) => [0x64, 0x00, 0x80, memtype, ...data, CRC_EOP]
const readPage = (memtype = 0x46) => [0x74, 0x00, 0x80, memtype, CRC_EOP]

describe('émulateur d’Optiboot', () => {
  it('n’avance pas l’adresse après PROG_PAGE : un client sans LOAD_ADDRESS par page écrase la même page', async () => {
    const { clock, board, talk } = await openBoard()
    clock.advance(400)
    await talk(loadAddress(0))
    await talk(progPage(page(1)))
    await talk(progPage(page(2)))
    expect(board.flash.subarray(0, 128)).toEqual(page(2))
    // La page suivante n'a jamais été écrite.
    expect(board.flash.subarray(128, 256)).toEqual(new Uint8Array(128).fill(0xff))
  })

  it('n’avance pas l’adresse après READ_PAGE : deux lectures de suite rendent la même page', async () => {
    const { clock, board, talk } = await openBoard()
    board.flash.set(page(1), 0)
    board.flash.set(page(9), 128)
    clock.advance(400)
    await talk(loadAddress(0))
    expect(await talk(readPage(), 128)).toEqual([...page(1)])
    expect(await talk(readPage(), 128)).toEqual([...page(1)])
  })

  it('ne touche à la flash que pour le type de mémoire F', async () => {
    const { clock, board, talk } = await openBoard()
    board.flash.set(page(1), 0)
    clock.advance(400)
    await talk(loadAddress(0))
    // Type EEPROM : rien n'est écrit dans la flash, la lecture rend de l'effacé.
    await talk(progPage(page(5), 0x45))
    expect(board.flash.subarray(0, 128)).toEqual(page(1))
    expect(await talk(readPage(0x45), 128)).toEqual(new Array(128).fill(0xff))
  })

  it('ne lit pas le port pendant son démarrage : la mémoire de réception de 2 octets déborde', async () => {
    const { clock, board, send } = await openBoard()
    // Trois GET_SYNC pendant le clignotement de la LED : 6 octets, 2 retenus.
    await send([0x30, CRC_EOP])
    await send([0x30, CRC_EOP])
    await send([0x30, CRC_EOP])
    expect(board.stats.overflowedBytes).toBe(4)
    expect(board.stats.repliesAt).toEqual([])
    clock.advance(400)
    // Une seule réponse, en retard, à la fin du démarrage.
    expect(board.stats.repliesAt).toHaveLength(1)
    await send([0x30, CRC_EOP])
    expect(board.stats.repliesAt).toHaveLength(2)
  })

  it('sort du chargeur après 1 s sans commande, et pas tant qu’un octet arrive toutes les 250 ms', async () => {
    const { clock, board, talk } = await openBoard()
    clock.advance(400)
    for (let count = 0; count < 120; count += 1) {
      await talk([0x30, CRC_EOP])
      clock.advance(250)
    }
    expect(board.stats.listening).toBe(true)
    expect(board.stats.programRunning).toBe(false)
    clock.advance(1_001)
    expect(board.stats.programRunning).toBe(true)
    expect(board.stats.listening).toBe(false)
  })
})
