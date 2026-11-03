import { createSimulatedBuzzerInput } from '@hardware/buzzers/simulatedBuzzerInput'

import { createManualClock } from '../_helpers/manualClock'

describe('buzzers simulés', () => {
  it('émet les appuis demandés, toujours actif', () => {
    const clock = createManualClock(100)
    const input = createSimulatedBuzzerInput({ clock })
    const presses = vi.fn()
    const keys = vi.fn()
    input.onPress(presses)
    input.onKey(keys)

    expect(input.getState()).toMatchObject({ active: true, simulation: true, focused: true })
    expect(input.press(3, 'B')).toEqual({
      desk: 3,
      button: 'B',
      buttonIndex: 1,
      at: 100,
      code: 'simulation',
    })
    input.press(1, 'D', 250)
    expect(presses).toHaveBeenCalledTimes(2)
    expect(presses.mock.calls[1]?.[0].at).toBe(250)
    expect(keys).toHaveBeenCalledTimes(2)
  })

  it('s’arrête après dispose', () => {
    const input = createSimulatedBuzzerInput()
    const changes = vi.fn()
    input.onChange(changes)
    input.dispose()
    input.dispose()
    expect(changes).toHaveBeenCalledTimes(1)
    expect(input.press(1, 'A')).toBeNull()
    expect(input.getState().active).toBe(false)
  })
})
