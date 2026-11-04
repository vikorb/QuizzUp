import type { GamepadLike } from '@hardware/buzzers/gamepadBuzzerInput'
import { createGamepadBuzzerInput, gamepadButtonCode } from '@hardware/buzzers/gamepadBuzzerInput'
import type { BuzzerKeymap } from '@hardware/buzzers/keymap'

import { createManualClock } from '../_helpers/manualClock'

const keymap: BuzzerKeymap = {
  [gamepadButtonCode(0)]: { desk: 1, button: 'A' },
  [gamepadButtonCode(5)]: { desk: 2, button: 'B' },
  [gamepadButtonCode(23)]: { desk: 6, button: 'D' },
}

function createPad(id = 'BBI-32 Button Box Interface', buttons = 32) {
  const pad = {
    index: 0,
    id,
    connected: true,
    timestamp: 0,
    buttons: Array.from({ length: buttons }, () => ({ pressed: false })),
  }
  return {
    pad,
    set(index: number, pressed: boolean, timestamp: number) {
      const button = pad.buttons[index]
      if (button) {
        button.pressed = pressed
      }
      pad.timestamp = timestamp
    },
  }
}

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('buzzers manette (API Gamepad)', () => {
  const setup = (pads: (GamepadLike | null)[], match?: (id: string) => boolean) => {
    const clock = createManualClock(1_000)
    const source = { getGamepads: vi.fn(() => pads) }
    const input = createGamepadBuzzerInput({
      keymap,
      clock,
      source,
      pollMs: 4,
      ...(match ? { match } : {}),
    })
    const presses = vi.fn()
    const keys = vi.fn()
    input.onPress(presses)
    input.onKey(keys)
    return { clock, input, presses, keys, source }
  }

  let current: ReturnType<typeof setup> | null = null
  afterEach(() => {
    current?.input.dispose()
    current = null
    setVisibility('visible')
  })

  it('émet un appui horodaté avec la mise à jour de la carte', () => {
    const board = createPad()
    current = setup([board.pad])
    expect(current.input.getState().active).toBe(true)
    expect(current.input.getGamepad()).toEqual({ id: board.pad.id, buttons: 32 })

    board.set(5, true, 1_002)
    current.clock.advance(4)
    expect(current.presses).toHaveBeenCalledWith({
      desk: 2,
      button: 'B',
      buttonIndex: 1,
      at: 1_002,
      code: 'GamepadButton5',
    })
    expect(current.input.getState().held).toEqual([{ desk: 2, button: 'B' }])
  })

  it('borne l’horodatage entre deux lectures', () => {
    const board = createPad()
    current = setup([board.pad])
    board.set(0, true, 10) // horloge de la carte incohérente : trop ancienne
    current.clock.advance(4)
    expect(current.presses.mock.calls[0]?.[0].at).toBe(1_000)

    board.set(0, false, 0)
    current.clock.advance(4)
    board.set(23, true, 0) // pas d'horodatage : heure de la lecture
    current.clock.advance(4)
    expect(current.presses.mock.calls[1]?.[0]).toMatchObject({ desk: 6, at: 1_012 })
  })

  it('un appui maintenu ne compte qu’une fois jusqu’au relâchement', () => {
    const board = createPad()
    current = setup([board.pad])
    board.set(0, true, 1_001)
    current.clock.advance(20)
    expect(current.presses).toHaveBeenCalledTimes(1)

    board.set(0, false, 1_030)
    current.clock.advance(12)
    expect(current.input.getState().held).toEqual([])
    board.set(0, true, 1_040)
    current.clock.advance(4)
    expect(current.presses).toHaveBeenCalledTimes(2)
  })

  it('remonte aussi les boutons non associés pour l’apprentissage', () => {
    const board = createPad()
    current = setup([board.pad])
    board.set(7, true, 1_003)
    current.clock.advance(4)
    expect(current.presses).not.toHaveBeenCalled()
    expect(current.keys).toHaveBeenCalledWith({ code: 'GamepadButton7', at: 1_003, press: null })
  })

  it('ignore les boutons déjà enfoncés au démarrage et à la reprise', () => {
    const board = createPad()
    board.set(0, true, 900)
    current = setup([board.pad])
    current.clock.advance(12)
    expect(current.presses).not.toHaveBeenCalled()

    board.set(0, false, 1_020)
    current.clock.advance(4)
    setVisibility('hidden')
    expect(current.input.getState().active).toBe(false)
    board.set(5, true, 1_030)
    current.clock.advance(8)
    setVisibility('visible')
    current.clock.advance(8)
    expect(current.presses).not.toHaveBeenCalled()
  })

  it('signale l’absence de carte et choisit la bonne carte', () => {
    const other = createPad('Manette de jeu', 16)
    const board = createPad()
    const pads: (GamepadLike | null)[] = [null, other.pad]
    current = setup(pads, (id) => id.includes('BBI'))
    expect(current.input.getState().active).toBe(false)
    expect(current.input.getGamepad()).toBeNull()

    const changes = vi.fn()
    current.input.onChange(changes)
    pads.push(board.pad)
    window.dispatchEvent(new Event('gamepadconnected'))
    expect(current.input.getGamepad()?.id).toBe(board.pad.id)
    expect(changes).toHaveBeenCalled()

    board.set(0, true, 1_001)
    current.clock.advance(4)
    board.pad.connected = false
    current.clock.advance(4)
    expect(current.input.getState()).toMatchObject({ active: false, held: [] })
  })

  it('survit à un navigateur qui refuse l’accès aux manettes', () => {
    const clock = createManualClock()
    const input = createGamepadBuzzerInput({
      keymap,
      clock,
      source: {
        getGamepads: () => {
          throw new Error('SecurityError')
        },
      },
    })
    expect(input.getState().active).toBe(false)
    input.dispose()
  })

  it('suit le focus, change de mapping et s’arrête proprement', () => {
    const board = createPad()
    current = setup([board.pad])
    window.dispatchEvent(new Event('blur'))
    expect(current.input.getState()).toMatchObject({ focused: false, active: true })
    window.dispatchEvent(new Event('focus'))
    expect(current.input.getState().focused).toBe(true)

    current.input.setKeymap({ [gamepadButtonCode(1)]: { desk: 3, button: 'C' } })
    expect(current.input.getKeymap()).toEqual({ GamepadButton1: { desk: 3, button: 'C' } })
    board.set(1, true, 1_001)
    current.clock.advance(4)
    expect(current.presses).toHaveBeenCalledWith(expect.objectContaining({ desk: 3, button: 'C' }))

    current.input.dispose()
    current.input.dispose()
    expect(current.input.getState().active).toBe(false)
    expect(current.clock.pending()).toBe(0)
  })

  it('utilise navigator.getGamepads par défaut', () => {
    const board = createPad()
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'getGamepads')
    Object.defineProperty(window.navigator, 'getGamepads', {
      configurable: true,
      value: () => [board.pad],
    })
    const input = createGamepadBuzzerInput({ keymap, clock: createManualClock() })
    expect(input.getGamepad()?.id).toBe(board.pad.id)
    input.dispose()
    if (original) {
      Object.defineProperty(window.navigator, 'getGamepads', original)
    } else {
      delete (window.navigator as { getGamepads?: unknown }).getGamepads
    }
  })
})
