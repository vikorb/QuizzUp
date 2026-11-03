import { createKeyboardBuzzerInput } from '@hardware/buzzers/keyboardBuzzerInput'
import { createDefaultKeymap } from '@hardware/buzzers/keymap'

import { createManualClock } from '../_helpers/manualClock'

const keydown = (code: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { code, cancelable: true, ...init })
  window.dispatchEvent(event)
  return event
}
const keyup = (code: string) => window.dispatchEvent(new KeyboardEvent('keyup', { code }))

describe('buzzers clavier', () => {
  const setup = () => {
    const clock = createManualClock(5_000)
    const input = createKeyboardBuzzerInput({ keymap: createDefaultKeymap(), clock })
    const presses = vi.fn()
    input.onPress(presses)
    return { clock, input, presses }
  }

  let current: ReturnType<typeof setup> | null = null
  afterEach(() => {
    current?.input.dispose()
    current = null
    vi.restoreAllMocks()
  })

  it('émet un appui horodaté au format écran et moteur', () => {
    current = setup()
    current.clock.advance(12)
    keydown('KeyE')
    expect(current.presses).toHaveBeenCalledWith({
      desk: 2,
      button: 'C',
      buttonIndex: 2,
      at: 5_012,
      code: 'KeyE',
    })
  })

  it('ignore l’auto-répétition et l’appui maintenu jusqu’au relâchement', () => {
    current = setup()
    keydown('KeyA')
    keydown('KeyA', { repeat: true })
    keydown('KeyA')
    expect(current.presses).toHaveBeenCalledTimes(1)
    expect(current.input.getState().held).toEqual([{ desk: 3, button: 'A' }])

    keyup('KeyA')
    expect(current.input.getState().held).toEqual([])
    keydown('KeyA')
    expect(current.presses).toHaveBeenCalledTimes(2)
  })

  it('ignore les combinaisons Ctrl, Alt et Méta', () => {
    current = setup()
    keydown('KeyA', { ctrlKey: true })
    keydown('KeyS', { altKey: true })
    keydown('KeyD', { metaKey: true })
    expect(current.presses).not.toHaveBeenCalled()
  })

  it('bloque l’action par défaut des touches associées seulement', () => {
    current = setup()
    expect(keydown('KeyA').defaultPrevented).toBe(true)
    expect(keydown('KeyP').defaultPrevented).toBe(false)
  })

  it('peut laisser passer l’action par défaut', () => {
    const input = createKeyboardBuzzerInput({
      keymap: createDefaultKeymap(),
      preventDefault: false,
    })
    expect(keydown('KeyA').defaultPrevented).toBe(false)
    input.dispose()
  })

  it('remonte toutes les touches autorisées pour l’apprentissage et le test', () => {
    current = setup()
    const keys = vi.fn()
    current.input.onKey(keys)
    keydown('KeyP')
    keydown('Digit1')
    keydown('Escape')
    expect(keys).toHaveBeenCalledTimes(2)
    expect(keys.mock.calls[0]?.[0]).toEqual({ code: 'KeyP', at: 5_000, press: null })
    expect(keys.mock.calls[1]?.[0].press).toMatchObject({ desk: 1, button: 'A' })
  })

  it('signale la perte et le retour du focus', () => {
    current = setup()
    const changes = vi.fn()
    current.input.onChange(changes)
    keydown('KeyA')

    window.dispatchEvent(new Event('blur'))
    expect(current.input.getState()).toMatchObject({ focused: false, active: false, held: [] })

    window.dispatchEvent(new Event('focus'))
    expect(current.input.getState()).toMatchObject({ focused: true, active: true })
    expect(changes).toHaveBeenCalled()

    // Le relâchement manqué pendant la perte de focus ne bloque pas le buzzer.
    keydown('KeyA')
    expect(current.presses).toHaveBeenCalledTimes(2)
  })

  it('signale l’onglet masqué', () => {
    current = setup()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(current.input.getState()).toMatchObject({ visible: false, active: false })
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(current.input.getState().visible).toBe(true)
  })

  it('change de mapping à chaud', () => {
    current = setup()
    current.input.setKeymap({ KeyP: { desk: 4, button: 'D' } })
    keydown('KeyA')
    keydown('KeyP')
    expect(current.presses).toHaveBeenCalledTimes(1)
    expect(current.presses.mock.calls[0]?.[0]).toMatchObject({ desk: 4, buttonIndex: 3 })
    expect(current.input.getKeymap()).toEqual({ KeyP: { desk: 4, button: 'D' } })
  })

  it('verrouille les touches système quand le navigateur le permet', async () => {
    current = setup()
    expect(await current.input.lockSystemKeys()).toBe(false)

    const keyboard = { lock: vi.fn().mockResolvedValue(undefined), unlock: vi.fn() }
    Object.defineProperty(navigator, 'keyboard', { value: keyboard, configurable: true })
    expect(await current.input.lockSystemKeys()).toBe(true)
    expect(current.input.getState().keyboardLocked).toBe(true)
    current.input.unlockSystemKeys()
    expect(keyboard.unlock).toHaveBeenCalled()
    expect(current.input.getState().keyboardLocked).toBe(false)

    keyboard.lock.mockRejectedValue(new Error('pas en plein écran'))
    expect(await current.input.lockSystemKeys()).toBe(false)
    Reflect.deleteProperty(navigator, 'keyboard')
  })

  it('n’écoute plus rien après dispose', () => {
    current = setup()
    current.input.dispose()
    current.input.dispose()
    keydown('KeyA')
    expect(current.presses).not.toHaveBeenCalled()
    expect(current.input.getState().active).toBe(false)
  })

  it('isole une erreur dans un abonné', () => {
    current = setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failing = vi.fn(() => {
      throw new Error('boum')
    })
    current.input.onPress(failing)
    const after = vi.fn()
    current.input.onPress(after)
    keydown('KeyA')
    expect(current.presses).toHaveBeenCalledTimes(1)
    expect(after).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalled()
  })
})
