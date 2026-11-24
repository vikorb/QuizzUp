import { createFakeSmokeBoard } from '../_helpers/fakeSmokeBoard'
import { createManualClock } from '../_helpers/manualClock'

/** Parle directement à la fausse carte, sans lien : on teste ici les règles de la carte elle-même. */
async function wire(sinceBoot = 0) {
  const clock = createManualClock()
  const board = createFakeSmokeBoard({ clock, banner: null })
  await board.port.open({ baudRate: 9600 })
  const writer = board.port.writable!.getWriter()
  const say = (text: string) => writer.write(Uint8Array.from(text, (char) => char.charCodeAt(0)))
  clock.advance(sinceBoot)
  return { clock, board, say }
}

describe('fausse carte : les règles du programme', () => {
  it('démarre en pause (COOL, cause CMD) pendant 5 s après la remise à zéro', async () => {
    const { clock, board } = await wire()
    expect(board.snapshot()).toMatchObject({ output: false, state: 'COOL', cause: 'CMD' })
    clock.advance(4999)
    expect(board.snapshot().state).toBe('COOL')
    clock.advance(1)
    expect(board.snapshot().state).toBe('READY')
  })

  it('refuse un F en COOL et verrouille : les F suivants sont ignorés, même la pause finie', async () => {
    const { clock, board, say } = await wire()
    await say('F\n')
    expect(board.snapshot().output).toBe(false)
    // Des F toutes les 100 ms (jamais 500 ms de silence) pendant 7 s : la pause finit à 5 s.
    for (let elapsed = 0; elapsed < 7000; elapsed += 100) {
      clock.advance(100)
      await say('F\n')
    }
    expect(board.snapshot()).toMatchObject({ output: false, state: 'READY' })
  })

  it('un verrou se lève après 500 ms sans F', async () => {
    const { clock, board, say } = await wire()
    for (let elapsed = 0; elapsed < 5200; elapsed += 100) {
      await say('F\n')
      clock.advance(100)
    }
    // Pause finie, mais le dernier F date de 400 ms : toujours verrouillée.
    clock.advance(300)
    await say('F\n')
    expect(board.snapshot().output).toBe(false)
    clock.advance(500)
    await say('F\n')
    expect(board.snapshot()).toMatchObject({ output: true, state: 'FIRE' })
  })

  it('un verrou se lève par un 0', async () => {
    const { clock, board, say } = await wire()
    await say('F\n')
    await say('0\n')
    clock.advance(5000)
    await say('F\n')
    expect(board.snapshot().output).toBe(true)
  })

  it('coupe 500 ms après le dernier F (LEASE), pas avant', async () => {
    const { clock, board, say } = await wire(5000)
    await say('F\n')
    clock.advance(499)
    expect(board.snapshot().output).toBe(true)
    clock.advance(1)
    expect(board.snapshot()).toMatchObject({ output: false, state: 'COOL', cause: 'LEASE' })
  })

  it('un nouveau jet attend 5 s après la fin du précédent', async () => {
    const { clock, board, say } = await wire(5000)
    await say('F\n')
    await say('0\n')
    clock.advance(4999)
    await say('F\n')
    expect(board.snapshot().output).toBe(false)
  })

  it('coupe au plafond de 10 s même si les F continuent (MAX)', async () => {
    const { clock, board, say } = await wire(5000)
    await say('F\n')
    const startedAt = clock.now()
    for (let elapsed = 0; elapsed < 10_000; elapsed += 100) {
      clock.advance(100)
      await say('F\n')
    }
    expect(board.snapshot()).toMatchObject({
      output: false,
      cause: 'MAX',
      lastCutAt: startedAt + 10_000,
    })
  })

  it('H est neutre : il n’allume pas, ne coupe pas et ne renouvelle pas le bail', async () => {
    const { clock, board, say } = await wire(5000)
    await say('H\n')
    expect(board.snapshot().output).toBe(false)
    await say('F\n')
    clock.advance(400)
    await say('H\n')
    expect(board.snapshot().output).toBe(true)
    clock.advance(100)
    expect(board.snapshot()).toMatchObject({ output: false, cause: 'LEASE' })
  })

  it.each([
    ['0\n', 'CMD'],
    ['f\n', 'BAD'],
    ['F \n', 'BAD'],
    ['FF\n', 'BAD'],
    ['F\r\n', 'BAD'],
    ['\n', 'BAD'],
  ])('seule la ligne exacte F allume, toute autre ligne coupe : %j', async (line, cause) => {
    const { board, say } = await wire(5000)
    await say('F\n')
    expect(board.snapshot().output).toBe(true)
    await say(line)
    expect(board.snapshot()).toMatchObject({ output: false, cause })
  })

  it('une ligne reçue au repos ne change pas la cause de la dernière coupure', async () => {
    const { clock, board, say } = await wire(5000)
    await say('F\n')
    clock.advance(600)
    await say('0\n')
    await say('???\n')
    expect(board.snapshot().cause).toBe('LEASE')
  })

  it('répond par une ligne d’état après chaque ligne reçue, sauf muette', async () => {
    const { board, say } = await wire(5000)
    await say('H\nF\n')
    expect(board.received.map((entry) => entry.line)).toEqual(['H', 'F'])
    board.mute(true)
    await say('H\n')
    expect(board.received).toHaveLength(3)
  })
})
