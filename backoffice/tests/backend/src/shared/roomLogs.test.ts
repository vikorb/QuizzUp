import { describe, expect, it } from 'vitest'

import {
  cleanRoomLogText,
  pickRoomLogContext,
  ROOM_LOG_CONTEXT_KEYS,
  ROOM_LOG_CONTEXT_MAX_LENGTH,
  ROOM_LOG_CONTEXT_VALUE_MAX_LENGTH,
  ROOM_LOG_EMAIL_PLACEHOLDER,
  scrubEmails,
} from '@quizzup/shared'

describe('scrubEmails', () => {
  it.each([
    ['lea@exemple.fr', '[email]'],
    ['Envoi pour lea.martin@exemple.fr refusé', 'Envoi pour [email] refusé'],
    ['(lea+jeu@exemple.fr)', '[email]'],
    ['a@b et c@d', '[email] et [email]'],
    ['v1@lea@exemple.fr', '[email]'],
    ['sans adresse, 100 % local', 'sans adresse, 100 % local'],
  ])('%s -> %s', (input, expected) => {
    expect(scrubEmails(input)).toBe(expected)
  })

  it('can be called again and again (no state kept between calls)', () => {
    expect(scrubEmails('a@b')).toBe(ROOM_LOG_EMAIL_PLACEHOLDER)
    expect(scrubEmails('a@b')).toBe(ROOM_LOG_EMAIL_PLACEHOLDER)
  })
})

describe('cleanRoomLogText', () => {
  it('masks first, then cuts', () => {
    expect(cleanRoomLogText('abc a@b', 12)).toBe('abc [email]')
    expect(cleanRoomLogText('abc a@b', 6)).toBe('abc [e')
  })

  it.each([
    ['without @', 'a'.repeat(100_000)],
    ['with a @ at the end', `${'a'.repeat(100_000)}@b`],
    ['with a @ at the start', `a@${'b'.repeat(100_000)}`],
  ])('stays fast on a 100 000 character word %s', (_name, text) => {
    const start = performance.now()
    const cleaned = cleanRoomLogText(text, 300)

    expect(performance.now() - start).toBeLessThan(200)
    expect(cleaned.length).toBeLessThanOrEqual(300)
  })

  it('does not leak an address cut by maxLength', () => {
    // L'adresse commence avant la coupe et finit après : elle est masquée en entier.
    const text = `${'x'.repeat(290)} lea.martin@exemple.fr`

    const cleaned = cleanRoomLogText(text, 300)

    expect(cleaned).not.toContain('@')
    expect(cleaned).not.toContain('exemple')
    expect(cleaned).toBe(`${'x'.repeat(290)} [email]`.slice(0, 300))
  })
})

describe('pickRoomLogContext', () => {
  it('keeps only the whitelisted keys, strings and finite numbers', () => {
    expect(
      pickRoomLogContext({
        route: 'play',
        phase: 'question',
        miniGame: 'flash_blind_test',
        desk: 3,
        driver: 'usbpro',
        httpStatus: 503,
        email: 'lea@exemple.fr',
        displayName: 'Léa',
        nested: { desk: 1 },
      })
    ).toEqual({
      route: 'play',
      phase: 'question',
      miniGame: 'flash_blind_test',
      desk: 3,
      driver: 'usbpro',
      httpStatus: 503,
    })
  })

  it('drops other value types, empty strings and non-finite numbers', () => {
    expect(
      pickRoomLogContext({
        route: '',
        phase: null,
        desk: Number.NaN,
        driver: ['a'],
        httpStatus: true,
      })
    ).toBeNull()
  })

  it('masks addresses and cuts long values', () => {
    const context = pickRoomLogContext({ route: 'x@y.z', phase: 'p'.repeat(200) })

    expect(context?.route).toBe(ROOM_LOG_EMAIL_PLACEHOLDER)
    expect(context?.phase).toHaveLength(ROOM_LOG_CONTEXT_VALUE_MAX_LENGTH)
  })

  it('returns null for anything that is not an object', () => {
    expect(pickRoomLogContext(undefined)).toBeNull()
    expect(pickRoomLogContext(null)).toBeNull()
    expect(pickRoomLogContext('route=play')).toBeNull()
    expect(pickRoomLogContext({})).toBeNull()
  })

  it('always fits the 1 KB the database accepts, even with every key at its maximum', () => {
    const full = Object.fromEntries(
      ROOM_LOG_CONTEXT_KEYS.map((key) => [key, 'é'.repeat(ROOM_LOG_CONTEXT_VALUE_MAX_LENGTH)])
    )

    expect(JSON.stringify(pickRoomLogContext(full)).length).toBeLessThanOrEqual(
      ROOM_LOG_CONTEXT_MAX_LENGTH
    )
  })
})
