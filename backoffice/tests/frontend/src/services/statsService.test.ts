import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadStatsService } from '@/services/statsService'

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}))

vi.mock('@/utils/api', () => ({
  apiFetch: apiFetchMock,
}))

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('services/statsService', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it('reads the statistics of a company', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { sessions: { finished: 1 } }))

    const result = await loadStatsService(7)

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/stats',
      authenticated: true,
    })
    expect(result).toEqual({ ok: true, status: 200, data: { sessions: { finished: 1 } } })
  })

  it('sends the period, the room and the time zone, and skips the empty ones', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, {}))

    await loadStatsService(7, {
      from: '2026-11-05T00:00:00.000Z',
      to: undefined,
      roomId: 3,
      tz: 'Europe/Paris',
    })

    const { path } = apiFetchMock.mock.calls[0]![0] as { path: string }
    const [pathname, queryString] = path.split('?')

    expect(pathname).toBe('/companies/7/stats')
    expect(Object.fromEntries(new URLSearchParams(queryString))).toEqual({
      from: '2026-11-05T00:00:00.000Z',
      roomId: '3',
      tz: 'Europe/Paris',
    })
  })

  it('answers api_unreachable when the request does not go through', async () => {
    apiFetchMock.mockResolvedValue(null)

    expect(await loadStatsService(7)).toEqual({ ok: false, status: null, error: 'api_unreachable' })
  })

  it.each([
    [400, 'stats_period_invalid'],
    [400, 'stats_timezone_invalid'],
    [400, 'invalid_params'],
    [403, 'forbidden'],
  ])('reads the code of a %i answer: %s', async (status, error) => {
    apiFetchMock.mockResolvedValue(jsonResponse(status, { error }))

    expect(await loadStatsService(7)).toEqual({ ok: false, status, error })
  })

  it('falls back on the status when the code is unknown or missing', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonResponse(401, {}))
    apiFetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'something_else' }))
    apiFetchMock.mockResolvedValueOnce(jsonResponse(500, null))

    expect(await loadStatsService(7)).toMatchObject({ error: 'unauthorized' })
    expect(await loadStatsService(7)).toMatchObject({ error: 'forbidden' })
    expect(await loadStatsService(7)).toMatchObject({ error: 'server_error' })
  })

  it('answers invalid_json when a success carries no JSON', async () => {
    apiFetchMock.mockResolvedValue(new Response('pas du json', { status: 200 }))

    expect(await loadStatsService(7)).toEqual({ ok: false, status: 200, error: 'invalid_json' })
  })
})
