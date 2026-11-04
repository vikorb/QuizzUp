import {
  createDefaultKeymap,
  findCode,
  findSlot,
  isAllowedBuzzerCode,
  listSlots,
  missingSlots,
  parseKeymap,
} from '@hardware/buzzers/keymap'

describe('keymap des buzzers', () => {
  it('refuse les touches système et les touches de fonction', () => {
    for (const code of [
      'Escape',
      'Tab',
      'MetaLeft',
      'AltRight',
      'F11',
      'F12',
      'F1',
      '',
      'Unidentified',
    ]) {
      expect(isAllowedBuzzerCode(code)).toBe(false)
    }
    for (const code of ['KeyA', 'Digit1', 'Numpad5', 'Space', 'ArrowUp', 'Enter']) {
      expect(isAllowedBuzzerCode(code)).toBe(true)
    }
  })

  it('liste les 16 buzzers dans l’ordre de l’apprentissage', () => {
    const slots = listSlots()
    expect(slots).toHaveLength(16)
    expect(slots[0]).toEqual({ desk: 1, button: 'A' })
    expect(slots[4]).toEqual({ desk: 2, button: 'A' })
    expect(slots[15]).toEqual({ desk: 4, button: 'D' })
    expect(listSlots([1, 2])).toHaveLength(8)
  })

  it('fournit un mapping clavier par défaut complet et sans doublon', () => {
    const keymap = createDefaultKeymap()
    expect(Object.keys(keymap)).toHaveLength(16)
    expect(missingSlots(keymap)).toEqual([])
    expect(findSlot(keymap, 'KeyQ')).toEqual({ desk: 2, button: 'A' })
    expect(findCode(keymap, 4, 'D')).toBe('KeyV')
  })

  it('retrouve une touche et un buzzer, ou null', () => {
    const keymap = { KeyA: { desk: 1 as const, button: 'B' as const } }
    expect(findSlot(keymap, 'KeyA')).toEqual({ desk: 1, button: 'B' })
    expect(findSlot(keymap, 'KeyB')).toBeNull()
    expect(findSlot(keymap, 'toString')).toBeNull()
    expect(findCode(keymap, 2, 'A')).toBeNull()
    expect(missingSlots(keymap, [1])).toHaveLength(3)
  })

  describe('parseKeymap', () => {
    it('accepte une config vide', () => {
      expect(parseKeymap(undefined)).toEqual({ keymap: {}, problems: [] })
      expect(parseKeymap(null)).toEqual({ keymap: {}, problems: [] })
    })

    it('refuse un format qui n’est pas un objet', () => {
      expect(parseKeymap([]).problems).toHaveLength(1)
      expect(parseKeymap('KeyA').problems).toHaveLength(1)
    })

    it('écarte les entrées invalides, interdites et en double', () => {
      const result = parseKeymap({
        KeyA: { desk: 1, button: 'A' },
        KeyB: { desk: 7, button: 'A' },
        KeyC: { desk: 1, button: 'E' },
        KeyD: null,
        Escape: { desk: 2, button: 'A' },
        KeyE: { desk: 1, button: 'A' },
        KeyF: { desk: 3, button: 'C' },
      })
      expect(result.keymap).toEqual({
        KeyA: { desk: 1, button: 'A' },
        KeyF: { desk: 3, button: 'C' },
      })
      expect(result.problems).toHaveLength(5)
      expect(result.problems.join(' ')).toContain('associé deux fois')
      expect(result.problems.join(' ')).toContain('touche système interdite')
    })
  })
})
