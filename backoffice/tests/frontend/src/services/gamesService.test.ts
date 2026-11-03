import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  abortGameService,
  createGameService,
  listGameRoomsService,
  listGamesService,
  loadGameService,
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
})
