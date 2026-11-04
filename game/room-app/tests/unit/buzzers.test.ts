import {
  ALL_DESKS,
  createSimulationKeymap,
  formatKeyCode,
  getDeskKeys,
  isDeskNumber,
  loadKeyboardLayout,
} from '@/hardware/buzzers'

describe('buzzers de la salle', () => {
  it('fournit un clavier de simulation : une rangée par pupitre', () => {
    const four = createSimulationKeymap(4)
    expect(Object.keys(four)).toHaveLength(16)
    expect(four.KeyQ).toEqual({ desk: 2, button: 'A' })
    expect(four.KeyV).toEqual({ desk: 4, button: 'D' })
  })

  it('étend le clavier de simulation aux pupitres 5 et 6, et le limite aux pupitres de la salle', () => {
    expect(ALL_DESKS).toEqual([1, 2, 3, 4, 5, 6])
    const six = createSimulationKeymap(6)
    expect(Object.keys(six)).toHaveLength(24)
    expect(getDeskKeys(six, 5)).toEqual(['5', '6', '7', '8'])
    expect(getDeskKeys(six, 6)).toEqual(['T', 'Y', 'U', 'I'])
    expect(Object.keys(createSimulationKeymap(2))).toHaveLength(8)
    // Valeur absente ou absurde : 4 pupitres, comme une salle neuve.
    expect(Object.keys(createSimulationKeymap(Number.NaN))).toHaveLength(16)
  })

  it('connaît les pupitres 1 à 6', () => {
    expect([0, 1, 4, 5, 6, 7].map((value) => isDeskNumber(value))).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
    ])
  })

  it('affiche les touches d’un pupitre dans l’ordre A-D', () => {
    expect(getDeskKeys(createSimulationKeymap(4), 1)).toEqual(['1', '2', '3', '4'])
    expect(getDeskKeys(createSimulationKeymap(4), 3)).toEqual(['A', 'S', 'D', 'F'])
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
