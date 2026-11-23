import { createParticipantFixture } from '@frontend-tests/_helpers/gamesServiceMock'
import { describe, expect, it } from 'vitest'

import type { GameParticipant } from '@/types/game'
import { rankGameParticipants } from '@/utils/game/ranking'

function team(podium: number, score: number, overrides: Partial<GameParticipant> = {}) {
  return createParticipantFixture({
    id: podium,
    podium,
    displayName: `Team ${podium}`,
    score,
    ...overrides,
  })
}

function ranks(participants: GameParticipant[]): number[] {
  return rankGameParticipants(participants).map((row) => row.rank)
}

describe('utils/game/ranking', () => {
  it('orders by score, highest first', () => {
    const rows = rankGameParticipants([team(1, 5), team(2, 12), team(3, 8)])

    expect(rows.map((row) => row.names[0])).toEqual(['Team 2', 'Team 3', 'Team 1'])
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3])
    expect(rows.map((row) => row.score)).toEqual([12, 8, 5])
  })

  it('gives tied teams the same rank and skips the next one', () => {
    expect(ranks([team(1, 10), team(2, 7), team(3, 7), team(4, 3)])).toEqual([1, 2, 2, 4])
  })

  it('shares first place when the leaders are tied', () => {
    expect(ranks([team(1, 9), team(2, 9), team(3, 4)])).toEqual([1, 1, 3])
  })

  it('shares last place when the losers are tied', () => {
    expect(ranks([team(1, 9), team(2, 4), team(3, 4)])).toEqual([1, 2, 2])
  })

  it('ranks everyone first when all scores are equal', () => {
    expect(ranks([team(1, 0), team(2, 0), team(3, 0), team(4, 0)])).toEqual([1, 1, 1, 1])
  })

  it('orders tied teams by podium', () => {
    const rows = rankGameParticipants([team(3, 6), team(1, 6), team(2, 6)])

    expect(rows.map((row) => row.names[0])).toEqual(['Team 1', 'Team 2', 'Team 3'])
  })

  it('handles a single team and an empty game', () => {
    expect(ranks([team(1, 0)])).toEqual([1])
    expect(rankGameParticipants([])).toEqual([])
  })

  it('lists the second player with the team and never exposes an email', () => {
    const [row] = rankGameParticipants([
      team(1, 4, {
        email: 'one@quizzup.test',
        hasEmail: true,
        secondPlayer: {
          displayName: 'Alex',
          email: 'two@quizzup.test',
          hasEmail: true,
          consentAt: null,
          marketingConsent: false,
        },
      }),
    ])

    expect(row.names).toEqual(['Team 1', 'Alex'])
    expect(JSON.stringify(row)).not.toContain('quizzup.test')
  })

  it('does not modify the list it receives', () => {
    const participants = [team(1, 1), team(2, 9)]

    rankGameParticipants(participants)

    expect(participants.map((participant) => participant.podium)).toEqual([1, 2])
  })
})
