import type { GamepadLike } from '@hardware/buzzers/gamepadBuzzerInput'
import { createGamepadBuzzerInput, gamepadButtonCode } from '@hardware/buzzers/gamepadBuzzerInput'
import type { BuzzerKeymap } from '@hardware/buzzers/keymap'
import { gamepadMatcher } from '@hardware/config'

import { createManualClock } from '../_helpers/manualClock'

const keymap: BuzzerKeymap = { [gamepadButtonCode(0)]: { desk: 1, button: 'A' } }

const pad = (index: number, id: string, connected = true): GamepadLike => ({
  index,
  id,
  connected,
  timestamp: 0,
  buttons: Array.from({ length: 4 }, () => ({ pressed: false })),
})

const BOARD = 'BBI-32 Button Box Interface (Vendor: 0483 Product: 5750)'

describe('manette retrouvée par son id, ambiguïté signalée', () => {
  const inputs: { dispose: () => void }[] = []
  afterEach(() => {
    inputs.splice(0).forEach((input) => input.dispose())
  })
  const open = (pads: (GamepadLike | null)[], source = { kind: 'gamepad' as const, id: BOARD }) => {
    const input = createGamepadBuzzerInput({
      keymap,
      clock: createManualClock(),
      source: { getGamepads: () => pads },
      match: gamepadMatcher(source),
    })
    inputs.push(input)
    return input
  }

  it('l’id retenu ne retient que la carte de cet id', () => {
    const other = pad(0, 'Xbox 360 Controller (XInput STANDARD GAMEPAD)')
    const board = pad(1, BOARD)
    // Même choix quel que soit l'ordre de branchement.
    for (const pads of [
      [other, board],
      [board, other],
      [null, board, other],
    ]) {
      const input = open(pads)
      expect(input.getGamepad()).toMatchObject({ id: BOARD, index: 1 })
      expect(input.getAmbiguousGamepads()).toEqual([])
    }
  })

  it('carte retenue absente, un autre modèle branché : rien n’est lu', () => {
    const input = open([pad(0, 'Xbox 360 Controller')])
    expect(input.getGamepad()).toBeNull()
    expect(input.getState().active).toBe(false)
    expect(input.getAmbiguousGamepads()).toEqual([])
  })

  it('sans id, `match` garde son rôle (ancienne configuration)', () => {
    const source = { kind: 'gamepad' as const, match: 'bbi-32' } as never
    const input = open([pad(0, 'Autre'), pad(1, BOARD)], source)
    expect(input.getGamepad()).toMatchObject({ index: 1 })
  })

  it('deux cartes identiques : aucune n’est lue et l’ambiguïté est signalée', () => {
    const presses = vi.fn()
    const changes = vi.fn()
    const pads = [pad(0, BOARD), pad(1, BOARD), pad(2, 'Autre')]
    const clock = createManualClock()
    const input = createGamepadBuzzerInput({
      keymap,
      clock,
      source: { getGamepads: () => pads },
      match: gamepadMatcher({ kind: 'gamepad', id: BOARD }),
    })
    inputs.push(input)
    input.onPress(presses)
    input.onChange(changes)

    expect(input.getGamepad()).toBeNull()
    expect(input.getState().active).toBe(false)
    expect(input.getAmbiguousGamepads().map((twin) => twin.index)).toEqual([0, 1])

    // Un appui sur l'une des deux cartes n'est pas pris pour un buzz.
    const first = pads[0]
    if (first) {
      first.buttons = [{ pressed: true }, ...first.buttons.slice(1)]
    }
    clock.advance(20)
    expect(presses).not.toHaveBeenCalled()
  })

  it('l’ordre des deux cartes identiques ne change pas le résultat', () => {
    const first = pad(0, BOARD)
    const second = pad(1, BOARD)
    for (const pads of [
      [first, second],
      [second, first],
    ]) {
      const input = open(pads)
      expect(input.getGamepad()).toBeNull()
      expect(input.getAmbiguousGamepads()).toHaveLength(2)
    }
  })

  it('l’ambiguïté se lève dès qu’une carte est débranchée, et le changement est annoncé', () => {
    const first = pad(0, BOARD)
    const second = pad(1, BOARD)
    const pads = [first, second]
    const clock = createManualClock()
    const input = createGamepadBuzzerInput({
      keymap,
      clock,
      source: { getGamepads: () => pads },
      match: gamepadMatcher({ kind: 'gamepad', id: BOARD }),
    })
    inputs.push(input)
    const changes = vi.fn()
    input.onChange(changes)
    expect(input.getAmbiguousGamepads()).toHaveLength(2)

    second.connected = false
    clock.advance(4)
    expect(input.getAmbiguousGamepads()).toEqual([])
    expect(input.getGamepad()).toMatchObject({ index: 0 })
    expect(changes).toHaveBeenCalled()
  })

  it('gamepadMatcher : l’id est exact et prime sur match', () => {
    const matcher = gamepadMatcher({ kind: 'gamepad', id: BOARD, match: 'xbox' })
    expect(matcher?.(BOARD)).toBe(true)
    expect(matcher?.(BOARD.toLowerCase())).toBe(false)
    expect(matcher?.('Xbox 360 Controller')).toBe(false)
    expect(gamepadMatcher({ kind: 'gamepad', match: 'xbox' })?.('Xbox 360')).toBe(true)
    expect(gamepadMatcher({ kind: 'gamepad' })).toBeUndefined()
  })
})
