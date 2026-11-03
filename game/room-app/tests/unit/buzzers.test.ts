import {
  createKeyboardBuzzerInput,
  getSimulationKeys,
  SIMULATION_KEYMAP,
  toEngineButton,
} from '@/hardware/buzzers'

function keydown(code: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('buzzers clavier (simulation)', () => {
  it('associe 4 rangées de touches physiques aux 4 pupitres', () => {
    expect(Object.keys(SIMULATION_KEYMAP)).toHaveLength(16)
    expect(SIMULATION_KEYMAP.KeyQ).toEqual({ desk: 2, button: 'A' })
    expect(SIMULATION_KEYMAP.KeyV).toEqual({ desk: 4, button: 'D' })
    expect(getSimulationKeys(1)).toEqual(['1', '2', '3', '4'])
    expect(getSimulationKeys(3)).toEqual(['A', 'S', 'D', 'F'])
  })

  it('traduit A-D en index du moteur', () => {
    expect([toEngineButton('A'), toEngineButton('D')]).toEqual([0, 3])
  })

  it('émet un appui horodaté et empêche l’action par défaut', () => {
    const input = createKeyboardBuzzerInput({ now: () => 1234 })
    const listener = vi.fn()
    input.onPress(listener)

    const event = keydown('KeyS')

    expect(listener).toHaveBeenCalledWith({ desk: 3, button: 'B', at: 1234 })
    expect(event.defaultPrevented).toBe(true)
    input.dispose()
  })

  it('ignore l’auto-répétition, les touches inconnues et la saisie dans un champ', () => {
    const input = createKeyboardBuzzerInput()
    const listener = vi.fn()
    input.onPress(listener)
    const field = document.createElement('input')
    document.body.append(field)

    keydown('KeyQ', { repeat: true })
    keydown('Space')
    keydown('KeyQ', {}, field)

    expect(listener).not.toHaveBeenCalled()
    field.remove()
    input.dispose()
  })

  it('se désinscrit proprement', () => {
    const input = createKeyboardBuzzerInput()
    const listener = vi.fn()
    const off = input.onPress(listener)

    off()
    keydown('Digit1')
    input.dispose()
    keydown('Digit1')

    expect(listener).not.toHaveBeenCalled()
  })
})
