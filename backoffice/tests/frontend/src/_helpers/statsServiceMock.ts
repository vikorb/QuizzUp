import { vi } from 'vitest'

import type { CompanyStats, StatsQuery, StatsResult } from '@/types/stats'

export const statsFixture: CompanyStats = {
  period: {
    from: '2026-10-24T00:00:00.000Z',
    to: '2026-11-23T00:00:00.000Z',
    timeZone: 'Europe/Paris',
  },
  sessions: {
    finished: 8,
    aborted: 2,
    abandonRate: 0.2,
    medianDurationSeconds: 2527,
    byRoom: [
      { roomId: 10, roomName: 'Salle Néon', finished: 5, aborted: 1 },
      { roomId: 11, roomName: 'Salle Laser', finished: 3, aborted: 1 },
    ],
  },
  players: {
    total: 21,
    averagePerSession: 2.6,
    withEmail: 14,
    emailRate: 0.6667,
    withMarketingConsent: 7,
    marketingConsentRate: 0.3333,
    distinctEmails: 12,
    returningEmails: 3,
  },
  busiestSlots: [
    { weekday: 6, hour: 20, sessions: 4 },
    { weekday: 3, hour: 14, sessions: 2 },
    { weekday: 7, hour: 23, sessions: 1 },
  ],
}

export const loadStatsServiceMock = vi.fn(
  async (_companyId: number, _query?: StatsQuery): Promise<StatsResult> => ({
    ok: true,
    status: 200,
    data: statsFixture,
  })
)

export const statsServiceModuleMock = {
  loadStatsService: loadStatsServiceMock,
}

export function resetStatsServiceMock(): void {
  loadStatsServiceMock.mockReset()
  loadStatsServiceMock.mockResolvedValue({ ok: true, status: 200, data: statsFixture })
}
