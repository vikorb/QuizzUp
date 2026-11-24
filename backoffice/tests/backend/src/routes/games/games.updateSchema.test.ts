import { MINI_GAME_FIRST_BUZZ, MINI_GAMES } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { updateGameSchema } from '@backend/routes/games/_schemas'

/**
 * Corps de PATCH écrits à la main, identiques à ceux que produit `buildUpdateGamePayload` du
 * formulaire de session (frontend). Si le schéma change, ces corps doivent rester acceptés.
 */
describe('updateGameSchema: corps du formulaire de modification', () => {
  it('accepts the body of a form where only the start changed', () => {
    const result = updateGameSchema.safeParse({
      roomId: 10,
      playersCount: 7,
      scheduledAt: '2026-12-05T14:30:00.000Z',
    })

    expect(result.success).toBe(true)
  })

  it('accepts a body with every field the form can send', () => {
    const result = updateGameSchema.safeParse({
      roomId: 10,
      playersCount: null,
      roundsCount: 5,
      questionsPerRound: 4,
      miniGames: [MINI_GAME_FIRST_BUZZ],
      scheduledAt: '2026-12-05T14:30:00.000Z',
      durationMinutes: 90,
      externalRef: null,
      participants: [
        {
          podium: 1,
          displayName: 'Team A',
          email: 'a@quizzup.test',
          emailConsent: true,
          marketingConsent: false,
          secondPlayer: { displayName: 'Alex' },
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('accepts the full list of mini-games and stores it as all (null)', () => {
    const result = updateGameSchema.safeParse({ roomId: 10, miniGames: [...MINI_GAMES] })

    expect(result.success).toBe(true)
    expect(result.data?.miniGames).toBeNull()
  })

  it('refuses null for the mini-games: all is written as the full list', () => {
    expect(updateGameSchema.safeParse({ roomId: 10, miniGames: null }).success).toBe(false)
  })

  it('accepts a text reference and null to clear it', () => {
    expect(updateGameSchema.safeParse({ externalRef: 'BK-42' }).data?.externalRef).toBe('BK-42')
    expect(updateGameSchema.safeParse({ externalRef: null }).data?.externalRef).toBeNull()
  })
})
