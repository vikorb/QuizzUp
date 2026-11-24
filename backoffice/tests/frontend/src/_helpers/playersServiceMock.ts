import { vi } from 'vitest'

import type { Player, PlayersList, PlayersQuery, PlayersResult } from '@/types/player'

export function createPlayerFixture(overrides: Partial<Player> = {}): Player {
  return {
    email: 'lea@example.test',
    displayName: 'Léa',
    sessions: 3,
    lastPlayedAt: '2026-11-20T19:30:00.000Z',
    bestScore: 1200,
    marketingConsent: true,
    ...overrides,
  }
}

export const playersFixture: PlayersList = {
  players: [
    createPlayerFixture(),
    createPlayerFixture({
      email: 'max@example.test',
      displayName: 'Max',
      sessions: 0,
      lastPlayedAt: null,
      bestScore: null,
      marketingConsent: false,
    }),
  ],
  total: 2,
  anonymousPlayers: 4,
}

export const listPlayersServiceMock = vi.fn(
  async (_companyId: number, _query?: PlayersQuery): Promise<PlayersResult<PlayersList>> => ({
    ok: true,
    status: 200,
    data: playersFixture,
  })
)

export const exportPlayersServiceMock = vi.fn(
  async (_companyId: number): Promise<PlayersResult<Blob>> => ({
    ok: true,
    status: 200,
    data: new Blob(['email;prenom']),
  })
)

export const unsubscribePlayerServiceMock = vi.fn(
  async (_companyId: number, _email: string): Promise<PlayersResult<{ ok: true }>> => ({
    ok: true,
    status: 200,
    data: { ok: true },
  })
)

export const erasePlayerServiceMock = vi.fn(
  async (_companyId: number, _email: string): Promise<PlayersResult<{ erased: number }>> => ({
    ok: true,
    status: 200,
    data: { erased: 3 },
  })
)

export const playersServiceModuleMock = {
  listPlayersService: listPlayersServiceMock,
  exportPlayersService: exportPlayersServiceMock,
  unsubscribePlayerService: unsubscribePlayerServiceMock,
  erasePlayerService: erasePlayerServiceMock,
}

export function resetPlayersServiceMock(): void {
  listPlayersServiceMock.mockReset()
  listPlayersServiceMock.mockResolvedValue({ ok: true, status: 200, data: playersFixture })
  exportPlayersServiceMock.mockReset()
  exportPlayersServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: new Blob(['email;prenom']),
  })
  unsubscribePlayerServiceMock.mockReset()
  unsubscribePlayerServiceMock.mockResolvedValue({ ok: true, status: 200, data: { ok: true } })
  erasePlayerServiceMock.mockReset()
  erasePlayerServiceMock.mockResolvedValue({ ok: true, status: 200, data: { erased: 3 } })
}
