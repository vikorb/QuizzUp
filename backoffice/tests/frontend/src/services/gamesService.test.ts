import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  abortGameService,
  acceptGameRegistrationService,
  cancelGameService,
  closeGameJoinService,
  createGameService,
  listGameRegistrationsService,
  listGameRoomsService,
  listGamesService,
  loadGameService,
  openGameJoinService,
  openGameService,
  refuseGameRegistrationService,
  updateGameService,
} from '@/services/gamesService'

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

describe('services/gamesService', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it('lists the games of a company', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { games: [{ id: 1 }] }))

    const result = await listGamesService(7)

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/games',
      authenticated: true,
    })
    expect(result).toEqual({ ok: true, status: 200, data: { games: [{ id: 1 }] } })
  })

  it('lists the games with filters, leaving out the undefined ones', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { games: [], total: 0 }))

    const result = await listGamesService(7, {
      roomId: 10,
      from: '2027-03-27T23:00:00.000Z',
      to: '2027-03-29T22:00:00.000Z',
      limit: 200,
      state: undefined,
    })

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/games?roomId=10&from=2027-03-27T23%3A00%3A00.000Z&to=2027-03-29T22%3A00%3A00.000Z&limit=200',
      authenticated: true,
    })
    expect(result).toEqual({ ok: true, status: 200, data: { games: [], total: 0 } })
  })

  it('modifies a scheduled session with a PATCH and a JSON body', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { game: { id: 3, state: 'scheduled' } }))

    const result = await updateGameService(7, 3, {
      roomId: 10,
      playersCount: null,
      scheduledAt: '2027-03-27T09:00:00.000Z',
    })

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/games/3',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: 10,
        playersCount: null,
        scheduledAt: '2027-03-27T09:00:00.000Z',
      }),
      authenticated: true,
    })
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { game: { id: 3, state: 'scheduled' } },
    })
  })

  it.each(['game_not_scheduled', 'slot_taken', 'session_in_past', 'podium_not_in_room'])(
    'keeps the session error %s on modification',
    async (error) => {
      apiFetchMock.mockResolvedValue(
        jsonResponse(error === 'session_in_past' ? 400 : 409, { error })
      )

      const result = await updateGameService(7, 3, {
        roomId: 10,
        playersCount: null,
      })

      expect(result).toMatchObject({ ok: false, error })
    }
  )

  it('opens a scheduled session without sending a body', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { game: { id: 3, state: 'pending' } }))

    await openGameService(7, 3)

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/games/3/open',
      method: 'POST',
      authenticated: true,
    })
  })

  it('cancels a scheduled session without sending a body', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { game: { id: 3, state: 'cancelled' } }))

    await cancelGameService(7, 3)

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/games/3/cancel',
      method: 'POST',
      authenticated: true,
    })
  })

  it.each(['game_not_scheduled', 'session_not_open_yet', 'room_busy', 'slot_taken'])(
    'keeps the session error %s on open',
    async (error) => {
      apiFetchMock.mockResolvedValue(jsonResponse(409, { error }))

      expect(await openGameService(7, 3)).toEqual({ ok: false, status: 409, error })
    }
  )

  it('sends the filters and the page in the query string, and skips the empty ones', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { games: [], total: 0 }))

    await listGamesService(7, {
      state: 'finished',
      roomId: 3,
      from: '2026-11-05T00:00:00.000Z',
      to: undefined,
      limit: 50,
      offset: 100,
    })

    const { path } = apiFetchMock.mock.calls[0]![0] as { path: string }
    const [pathname, queryString] = path.split('?')

    expect(pathname).toBe('/companies/7/games')
    expect(Object.fromEntries(new URLSearchParams(queryString))).toEqual({
      state: 'finished',
      roomId: '3',
      from: '2026-11-05T00:00:00.000Z',
      limit: '50',
      offset: '100',
    })
  })

  it('loads one game', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { game: { id: 3 } }))

    await loadGameService(7, 3)

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/games/3',
      authenticated: true,
    })
  })

  it('creates a game with a JSON body', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(201, { game: { id: 9 } }))
    const payload = {
      roomId: 10,
      roundsCount: 10,
      questionsPerRound: 10,
      participants: [{ podium: 1, displayName: 'Team A' }],
    }

    const result = await createGameService(7, payload)

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/games',
      method: 'POST',
      authenticated: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(result.ok).toBe(true)
    expect(result.status).toBe(201)
  })

  it('stops a game without sending a body', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { game: { id: 3, state: 'aborted' } }))

    await abortGameService(7, 3)

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/games/3/abort',
      method: 'POST',
      authenticated: true,
    })
  })

  it('lists the rooms of a company', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { rooms: [] }))

    await listGameRoomsService(7)

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/rooms',
      authenticated: true,
    })
  })

  it.each(['room_busy', 'room_inactive', 'room_not_found'])(
    'keeps the business error %s',
    async (error) => {
      apiFetchMock.mockResolvedValue(
        jsonResponse(error === 'room_not_found' ? 404 : 409, { error })
      )

      const result = await createGameService(7, { roomId: 10, participants: [] })

      expect(result).toMatchObject({ ok: false, error })
    }
  )

  it('surfaces the missing GDPR consent from the validation details', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: 'invalid_body',
        details: { formErrors: [], fieldErrors: { participants: ['email_consent_required'] } },
      })
    )

    const result = await createGameService(7, { roomId: 10, participants: [] })

    expect(result).toEqual({ ok: false, status: 400, error: 'email_consent_required' })
  })

  it('keeps game_already_over when stopping a finished game', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(409, { error: 'game_already_over' }))

    const result = await abortGameService(7, 3)

    expect(result).toEqual({ ok: false, status: 409, error: 'game_already_over' })
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'conflict'],
    [400, 'invalid_body'],
    [500, 'server_error'],
  ])('falls back on the HTTP status %i', async (status, error) => {
    apiFetchMock.mockResolvedValue(new Response('oops', { status }))

    const result = await listGamesService(7)

    expect(result).toEqual({ ok: false, status, error })
  })

  it('reports an unreachable API', async () => {
    apiFetchMock.mockResolvedValue(null)

    expect(await listGamesService(7)).toEqual({
      ok: false,
      status: null,
      error: 'api_unreachable',
    })
  })

  it('reports an invalid JSON success body', async () => {
    apiFetchMock.mockResolvedValue(new Response('not json', { status: 200 }))

    expect(await listGamesService(7)).toEqual({ ok: false, status: 200, error: 'invalid_json' })
  })

  describe('sign-ups by QR code', () => {
    it('opens or regenerates the join link with a POST', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse(200, { join: { url: '/rejoindre/#t' } }))

      const result = await openGameJoinService(7, 3)

      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/companies/7/games/3/join',
        method: 'POST',
        authenticated: true,
      })
      expect(result).toEqual({ ok: true, status: 200, data: { join: { url: '/rejoindre/#t' } } })
    })

    it('closes the join link, an empty 204 being a success', async () => {
      apiFetchMock.mockResolvedValue(new Response(null, { status: 204 }))

      const result = await closeGameJoinService(7, 3)

      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/companies/7/games/3/join',
        method: 'DELETE',
        authenticated: true,
      })
      expect(result).toEqual({ ok: true, status: 204, data: undefined })
    })

    it('lists the pending registrations', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse(200, { registrations: [{ id: 5 }] }))

      const result = await listGameRegistrationsService(7, 3)

      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/companies/7/games/3/registrations',
        authenticated: true,
      })
      expect(result).toEqual({ ok: true, status: 200, data: { registrations: [{ id: 5 }] } })
    })

    it('accepts a registration on the chosen podium', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse(201, { participant: { id: 9 } }))

      await acceptGameRegistrationService(7, 3, 5, 2)

      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/companies/7/games/3/registrations/5/accept',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ podium: 2 }),
        authenticated: true,
      })
    })

    it('accepts a registration without a podium: the server takes the first free one', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse(201, { participant: { id: 9 } }))

      await acceptGameRegistrationService(7, 3, 5)

      expect(apiFetchMock.mock.calls[0]?.[0].body).toBe('{}')
    })

    it('reads the exact error code of a refused validation', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse(409, { error: 'podium_taken' }))

      expect(await acceptGameRegistrationService(7, 3, 5, 2)).toEqual({
        ok: false,
        status: 409,
        error: 'podium_taken',
      })
    })

    it('refuses a registration with a DELETE', async () => {
      apiFetchMock.mockResolvedValue(new Response(null, { status: 204 }))

      const result = await refuseGameRegistrationService(7, 3, 5)

      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/companies/7/games/3/registrations/5',
        method: 'DELETE',
        authenticated: true,
      })
      expect(result.ok).toBe(true)
    })
  })
})
