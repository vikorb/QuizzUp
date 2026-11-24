import { describe, expect, it } from 'vitest'

import { getGameErrorKey, isGameApiErrorCode, readGameApiError } from '@/utils/game/errors'

// Codes de l'API d'accueil des joueurs (lot 2) : chacun a son texte `games.errors.<clé>`.
const JOIN_ERROR_CODES = [
  ['game_not_pending', 'gameNotPending'],
  ['podium_taken', 'podiumTaken'],
  ['room_full', 'roomFull'],
  ['registration_not_found', 'registrationNotFound'],
  ['podium_not_in_room', 'podiumNotInRoom'],
] as const

describe('utils/game/errors: sign-up errors', () => {
  it.each(JOIN_ERROR_CODES)('maps %s to games.errors.%s', (code, key) => {
    expect(isGameApiErrorCode(code)).toBe(true)
    expect(readGameApiError({ error: code })).toBe(code)
    expect(getGameErrorKey(code)).toBe(`games.errors.${key}`)
  })

  it('has a French and an English text for each of them', async () => {
    const [fr, en] = await Promise.all([
      import('@/locales/fr/games.json'),
      import('@/locales/en/games.json'),
    ])

    for (const locale of [fr.default.games, en.default.games]) {
      for (const [, key] of JOIN_ERROR_CODES) {
        expect((locale.errors as Record<string, string>)[key]).toBeTruthy()
      }
    }
  })
})
