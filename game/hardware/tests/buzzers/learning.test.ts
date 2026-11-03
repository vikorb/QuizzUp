import { createBuzzerLearning } from '@hardware/buzzers/learning'

describe('apprentissage des buzzers', () => {
  it('associe les buzzers un par un dans l’ordre', () => {
    const learning = createBuzzerLearning({ desks: [1, 2] })
    expect(learning.getState()).toMatchObject({
      current: { desk: 1, button: 'A' },
      stepIndex: 0,
      totalSteps: 8,
      done: false,
    })

    const codes = ['KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH']
    for (const code of codes) {
      expect(learning.capture(code).status).toBe('assigned')
    }

    const state = learning.getState()
    expect(state.done).toBe(true)
    expect(state.current).toBeNull()
    expect(state.keymap.KeyE).toEqual({ desk: 2, button: 'A' })
    expect(learning.getKeymap()).toEqual(state.keymap)
    expect(learning.capture('KeyZ')).toEqual({ status: 'ignored' })
  })

  it('refuse une touche déjà associée à un autre buzzer', () => {
    const learning = createBuzzerLearning()
    learning.capture('KeyA')
    const result = learning.capture('KeyA')
    expect(result).toEqual({ status: 'duplicate', code: 'KeyA', usedBy: { desk: 1, button: 'A' } })
    expect(learning.getState().current).toEqual({ desk: 1, button: 'B' })
    expect(learning.getState().lastResult).toEqual(result)
  })

  it('refuse les touches système', () => {
    const learning = createBuzzerLearning()
    expect(learning.capture('Escape')).toEqual({ status: 'forbidden', code: 'Escape' })
    expect(learning.getState().stepIndex).toBe(0)
  })

  it('permet de passer un buzzer absent et de revenir en arrière', () => {
    const learning = createBuzzerLearning({ desks: [1] })
    learning.capture('KeyA')
    learning.skip()
    expect(learning.getState().current).toEqual({ desk: 1, button: 'C' })

    learning.back()
    expect(learning.getState().current).toEqual({ desk: 1, button: 'B' })
    learning.back()
    expect(learning.getState().current).toEqual({ desk: 1, button: 'A' })
    // Revenir en arrière libère la touche : elle peut être réassociée.
    expect(learning.getKeymap()).toEqual({})
    expect(learning.capture('KeyA').status).toBe('assigned')

    learning.back()
    learning.back()
    expect(learning.getState().stepIndex).toBe(0)
  })

  it('n’avance plus après la dernière étape', () => {
    const learning = createBuzzerLearning({ desks: [1] })
    for (let index = 0; index < 6; index += 1) {
      learning.skip()
    }
    expect(learning.getState().stepIndex).toBe(4)
  })

  it('recommence de zéro et prévient les abonnés', () => {
    const learning = createBuzzerLearning()
    const listener = vi.fn()
    const unsubscribe = learning.onChange(listener)
    learning.capture('KeyA')
    learning.restart()
    expect(learning.getState()).toMatchObject({ stepIndex: 0, keymap: {}, lastResult: null })
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    learning.capture('KeyB')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
