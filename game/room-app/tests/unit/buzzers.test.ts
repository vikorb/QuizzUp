import {
  formatKeyCode,
  getDeskKeys,
  loadKeyboardLayout,
  SIMULATION_KEYMAP,
} from '@/hardware/buzzers'

describe('buzzers de la salle', () => {
  it('fournit un clavier de simulation : une rangée par pupitre', () => {
    expect(Object.keys(SIMULATION_KEYMAP)).toHaveLength(16)
    expect(SIMULATION_KEYMAP.KeyQ).toEqual({ desk: 2, button: 'A' })
    expect(SIMULATION_KEYMAP.KeyV).toEqual({ desk: 4, button: 'D' })
  })

  it('affiche les touches d’un pupitre dans l’ordre A-D', () => {
    expect(getDeskKeys(SIMULATION_KEYMAP, 1)).toEqual(['1', '2', '3', '4'])
    expect(getDeskKeys(SIMULATION_KEYMAP, 3)).toEqual(['A', 'S', 'D', 'F'])
    expect(
      getDeskKeys(Object.fromEntries([['Numpad7', { desk: 2, button: 'C' } as const]]), 2)
    ).toEqual(['?', '?', '7', '?'])
  })

  it('raccourcit les codes de touche', () => {
    expect(formatKeyCode('KeyQ')).toBe('Q')
    expect(formatKeyCode('Digit4')).toBe('4')
    expect(formatKeyCode('ArrowUp')).toBe('ArrowUp')
  })
})

describe('touches affichées selon la disposition du clavier', () => {
  afterEach(() => loadKeyboardLayout({}))

  it('affiche les touches gravées en AZERTY', async () => {
    const azerty = new Map([
      ['KeyQ', 'a'],
      ['KeyW', 'z'],
      ['Digit1', '&'],
    ])
    await loadKeyboardLayout({ keyboard: { getLayoutMap: async () => azerty } })
    expect(formatKeyCode('KeyQ')).toBe('A')
    expect(formatKeyCode('KeyW')).toBe('Z')
    expect(formatKeyCode('Digit1')).toBe('1')
  })

  it('garde les noms QWERTY sans Keyboard API ou en cas d’échec', async () => {
    await loadKeyboardLayout({
      keyboard: { getLayoutMap: () => Promise.reject(new Error('not allowed')) },
    })
    expect(formatKeyCode('KeyQ')).toBe('Q')
    await loadKeyboardLayout(undefined)
    expect(formatKeyCode('KeyQ')).toBe('Q')
  })
})
