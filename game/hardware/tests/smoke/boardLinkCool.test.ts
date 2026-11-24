import { createSmokeBoardLink } from '@hardware/smoke/boardLink'

import type { FakeSmokeBoardOptions } from '../_helpers/fakeSmokeBoard'
import { advance, createFakeSmokeBoard, flush } from '../_helpers/fakeSmokeBoard'
import { createManualClock } from '../_helpers/manualClock'

/** Carte juste remise à zéro (pause de 5 s au démarrage), lien prêt, première phase lue. */
async function cold(options: Partial<FakeSmokeBoardOptions> = {}) {
  const clock = createManualClock()
  const board = createFakeSmokeBoard({ clock, ...options })
  const link = createSmokeBoardLink({ port: board.port, clock })
  const phases: (string | null)[] = []
  link.onChange((state) => {
    if (phases.at(-1) !== state.phase) {
      phases.push(state.phase)
    }
  })
  const opening = link.open()
  await advance(clock, 1000)
  expect(await opening).toBe('ready')
  return { clock, board, link, phases }
}

const sent = (board: ReturnType<typeof createFakeSmokeBoard>, line: string) =>
  board.received.filter((entry) => entry.line === line)

describe('pause de la carte (COOL)', () => {
  it('dès la bannière, interroge la carte par un H et expose sa phase', async () => {
    const { board, link, phases } = await cold()
    expect(board.received.map((entry) => entry.line)).toEqual(['H'])
    expect(link.getState()).toMatchObject({
      phase: 'cool',
      board: { output: false, state: 'COOL', cause: 'CMD' },
    })
    expect(phases).toEqual([null, 'cool'])
  })

  it('expose la phase au fil du jeu : cool, ready, fire, puis cool', async () => {
    const { clock, link, phases } = await cold()
    await advance(clock, 4500)
    link.drive(true)
    await advance(clock, 100)
    // Plus d'appel : le bail expire, la carte repasse en pause.
    await advance(clock, 1000)
    expect(phases).toEqual([null, 'cool', 'ready', 'fire', 'cool'])
    expect(link.getState().phase).toBe('cool')
  })

  it('n’envoie aucun F pendant la pause du démarrage, puis reprend dès que READY est lu', async () => {
    const { clock, board, link } = await cold()
    // 40 appels par seconde pendant 3 s, carte en COOL : rien ne part.
    await advance(clock, 3000, 25, () => link.drive(true))
    expect(sent(board, 'F')).toHaveLength(0)
    expect(sent(board, '0')).toHaveLength(0)
    expect(board.snapshot()).toMatchObject({ output: false, state: 'COOL' })
    // Fin de la pause (5 s après la remise à zéro) : le premier F part, la carte n'est pas verrouillée.
    await advance(clock, 3000, 25, () => link.drive(true))
    expect(sent(board, 'F').length).toBeGreaterThan(0)
    expect(board.snapshot()).toMatchObject({ output: true, state: 'FIRE' })
    expect(link.getState().phase).toBe('fire')
  })

  it('n’envoie pas de F tant que la phase lue n’est pas READY ou FIRE, quoi que dise la carte réelle', async () => {
    const { clock, board, link } = await cold()
    await advance(clock, 4500)
    expect(link.getState().phase).toBe('ready')
    board.inject('S 0 COOL MAX\n')
    await flush()
    expect(link.getState().phase).toBe('cool')
    link.drive(true)
    await advance(clock, 50)
    expect(sent(board, 'F')).toHaveLength(0)
    board.inject('S 0 READY MAX\n')
    await flush()
    await advance(clock, 25)
    link.drive(true)
    await flush()
    expect(sent(board, 'F')).toHaveLength(1)
  })

  it('avant toute ligne d’état, drive(true) n’envoie rien', async () => {
    const { clock, board, link } = await cold({ mute: true })
    expect(link.getState().phase).toBeNull()
    await advance(clock, 600, 25, () => link.drive(true))
    expect(sent(board, 'F')).toHaveLength(0)
  })

  it('un F arrivé en COOL (fin de plafond) : 0 une fois, plus de F jusqu’à READY, puis reprise', async () => {
    const { clock, board, link } = await cold()
    await advance(clock, 4500)
    // Jet continu, 40 appels par seconde : la carte coupe au plafond de 10 s (MAX).
    await advance(clock, 10_300, 25, () => link.drive(true))
    const { lastCutAt, cause } = board.snapshot()
    expect(cause).toBe('MAX')
    // Le F reçu juste après la coupure est refusé (la page ne savait pas encore) et verrouille la carte.
    const refused = sent(board, 'F').filter((entry) => entry.at >= lastCutAt!)
    expect(refused).toHaveLength(1)
    // Le lien lève le verrou par un seul 0 et n'envoie plus de F pendant la pause.
    expect(sent(board, '0')).toHaveLength(1)
    await advance(clock, lastCutAt! + 4400 - clock.now(), 25, () => link.drive(true))
    expect(sent(board, 'F').filter((entry) => entry.at >= lastCutAt!)).toHaveLength(1)
    expect(sent(board, '0')).toHaveLength(1)
    expect(board.snapshot().output).toBe(false)
    // Pause finie : READY lu, le F suivant est accepté, donc la carte n'était plus verrouillée.
    await advance(clock, 1600, 25, () => link.drive(true))
    expect(board.snapshot()).toMatchObject({ output: true, state: 'FIRE' })
    expect(link.getState().status).toBe('ready')
  })

  it('drive(false) envoie toujours 0 à la fin d’un jet', async () => {
    const { clock, board, link } = await cold()
    await advance(clock, 4500)
    await advance(clock, 1000, 25, () => link.drive(true))
    expect(board.snapshot().output).toBe(true)
    link.drive(false)
    await flush()
    expect(sent(board, '0')).toHaveLength(1)
    expect(board.snapshot()).toMatchObject({ output: false, cause: 'CMD' })
  })
})
