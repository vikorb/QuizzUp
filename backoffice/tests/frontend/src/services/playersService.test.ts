import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  erasePlayerService,
  exportPlayersService,
  listPlayersService,
  unsubscribePlayerService,
} from '@/services/playersService'

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

describe('services/playersService', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  describe('listPlayersService', () => {
    it('reads the first page of the players of a company', async () => {
      const list = { players: [], total: 0, anonymousPlayers: 0 }
      apiFetchMock.mockResolvedValue(jsonResponse(200, list))

      const result = await listPlayersService(7)

      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/companies/7/players', authenticated: true })
      )
      expect(result).toEqual({ ok: true, status: 200, data: list })
    })

    it('sends the search and the page, and skips the empty ones', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse(200, {}))

      await listPlayersService(7, { search: 'léa', limit: 50, offset: undefined })

      const { path } = apiFetchMock.mock.calls[0]![0] as { path: string }
      const [pathname, queryString] = path.split('?')

      expect(pathname).toBe('/companies/7/players')
      expect(Object.fromEntries(new URLSearchParams(queryString))).toEqual({
        search: 'léa',
        limit: '50',
      })
    })

    it('answers api_unreachable when the request does not go through', async () => {
      apiFetchMock.mockResolvedValue(null)

      expect(await listPlayersService(7)).toEqual({
        ok: false,
        status: null,
        error: 'api_unreachable',
      })
    })

    it('answers invalid_json when a success carries no JSON', async () => {
      apiFetchMock.mockResolvedValue(new Response('pas du json', { status: 200 }))

      expect(await listPlayersService(7)).toEqual({ ok: false, status: 200, error: 'invalid_json' })
    })

    it.each([
      [400, 'invalid_params'],
      [403, 'forbidden'],
      [404, 'player_not_found'],
    ])('reads the code of a %i answer: %s', async (status, error) => {
      apiFetchMock.mockResolvedValue(jsonResponse(status, { error }))

      expect(await listPlayersService(7)).toEqual({ ok: false, status, error })
    })

    it('falls back on the status when the code is unknown or missing', async () => {
      apiFetchMock.mockResolvedValueOnce(jsonResponse(401, {}))
      apiFetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'something_else' }))
      apiFetchMock.mockResolvedValueOnce(jsonResponse(404, null))
      apiFetchMock.mockResolvedValueOnce(jsonResponse(400, null))
      apiFetchMock.mockResolvedValueOnce(jsonResponse(500, null))

      expect(await listPlayersService(7)).toMatchObject({ error: 'unauthorized' })
      expect(await listPlayersService(7)).toMatchObject({ error: 'forbidden' })
      expect(await listPlayersService(7)).toMatchObject({ error: 'player_not_found' })
      expect(await listPlayersService(7)).toMatchObject({ error: 'invalid_params' })
      expect(await listPlayersService(7)).toMatchObject({ error: 'server_error' })
    })
  })

  describe('exportPlayersService', () => {
    it('reads the CSV as a file', async () => {
      apiFetchMock.mockResolvedValue(new Response('email;prenom', { status: 200 }))

      const result = await exportPlayersService(7)

      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/companies/7/players/export.csv', authenticated: true })
      )
      expect(result.ok).toBe(true)
      expect(result.ok && (await result.data.text())).toBe('email;prenom')
    })

    it('answers forbidden for a user', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse(403, { error: 'forbidden' }))

      expect(await exportPlayersService(7)).toEqual({ ok: false, status: 403, error: 'forbidden' })
    })
  })

  describe.each([
    ['unsubscribePlayerService', unsubscribePlayerService, 'unsubscribe', { ok: true }],
    ['erasePlayerService', erasePlayerService, 'erase', { erased: 3 }],
  ])('%s', (_name, service, route, answer) => {
    it('posts the address in the body, never in the URL', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse(200, answer))

      const result = await service(7, 'lea@example.test')
      const options = apiFetchMock.mock.calls[0]![0] as {
        path: string
        method: string
        body: string
        headers: Record<string, string>
      }

      expect(options.path).toBe(`/companies/7/players/${route}`)
      expect(options.method).toBe('POST')
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
      expect(JSON.parse(options.body)).toEqual({ email: 'lea@example.test' })
      expect(result).toEqual({ ok: true, status: 200, data: answer })
    })

    it('reads the code of a refusal', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse(403, { error: 'forbidden' }))

      expect(await service(7, 'lea@example.test')).toEqual({
        ok: false,
        status: 403,
        error: 'forbidden',
      })
    })
  })

  it('reads player_not_found when an erasure targets an unknown address', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(404, { error: 'player_not_found' }))

    expect(await erasePlayerService(7, 'nobody@example.test')).toEqual({
      ok: false,
      status: 404,
      error: 'player_not_found',
    })
  })
})
