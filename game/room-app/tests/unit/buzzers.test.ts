import { formatKeyCode, getDeskKeys, SIMULATION_KEYMAP } from '@/hardware/buzzers'

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
