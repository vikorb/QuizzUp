import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lookupJoinLink, sendJoinRegistration } from '@/public/join/joinApi'

const TOKEN = 'a'.repeat(43)
const fetchMock = vi.fn()

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('public/join/joinApi — lookupJoinLink', () => {
  it('posts the token in the body, never in the address', async () => {
    fetchMock.mockResolvedValue(
      reply(200, { companyName: 'Centre', roomName: 'Salle', logoUrl: null, expiresAt: 'x' })
    )

    const result = await lookupJoinLink(TOKEN)

    expect(result).toMatchObject({ ok: true, data: { companyName: 'Centre' } })

    const [url, init] = fetchMock.mock.calls[0]!

    expect(url).toBe('http://api.test/public/v1/join/lookup')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN })
    expect(init.credentials).toBeUndefined()
  })

  it('makes the logo path absolute: the API serves it, not the page origin', async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        companyName: 'Centre',
        roomName: 'Salle',
        logoUrl: '/public/v1/logos/x.png',
        expiresAt: 'x',
      })
    )

    const result = await lookupJoinLink(TOKEN)

    expect(result).toMatchObject({
      ok: true,
      data: { logoUrl: 'http://api.test/public/v1/logos/x.png' },
    })
  })

  it.each([
    [404, { error: 'join_link_invalid' }, 'invalid'],
    [410, { error: 'join_link_closed' }, 'closed'],
    [500, { error: 'server_error' }, 'server'],
    [502, null, 'server'],
  ])('maps %s to the reason %s', async (status, body, reason) => {
    fetchMock.mockResolvedValue(reply(status, body))

    expect(await lookupJoinLink(TOKEN)).toEqual({ ok: false, reason })
  })

  it('reports a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await lookupJoinLink(TOKEN)).toEqual({ ok: false, reason: 'network' })
  })
})

describe('public/join/joinApi — sendJoinRegistration', () => {
  it('posts the token with the registration, in the body only', async () => {
    fetchMock.mockResolvedValue(reply(201, { ok: true }))

    const result = await sendJoinRegistration(TOKEN, {
      displayName: 'Camille',
      email: 'camille@example.test',
    })

    expect(result).toEqual({ ok: true, data: { ok: true } })

    const [url, init] = fetchMock.mock.calls[0]!

    expect(url).toBe('http://api.test/public/v1/join/registrations')
    expect(JSON.parse(init.body)).toEqual({
      token: TOKEN,
      displayName: 'Camille',
      email: 'camille@example.test',
    })
  })

  it.each([
    [409, { error: 'join_full' }, 'full'],
    [404, { error: 'join_link_invalid' }, 'invalid'],
    [410, { error: 'join_link_closed' }, 'closed'],
  ])('maps %s to the reason %s', async (status, body, reason) => {
    fetchMock.mockResolvedValue(reply(status, body))

    expect(await sendJoinRegistration(TOKEN, { displayName: 'A' })).toEqual({ ok: false, reason })
  })

  it('gives the fields refused by the server on a 400 invalid_body, or none when absent', async () => {
    const fieldErrors = { email: ['Invalid email address'], 'secondPlayer.displayName': ['x'] }

    fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid_body', details: { fieldErrors } }))
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid_body' }))

    expect(await sendJoinRegistration(TOKEN, { displayName: 'A' })).toEqual({
      ok: false,
      reason: 'invalid_body',
      fieldErrors,
    })
    expect(await sendJoinRegistration(TOKEN, { displayName: 'A' })).toEqual({
      ok: false,
      reason: 'invalid_body',
      fieldErrors: {},
    })
  })

  it('gives the delay of a 429 from Retry-After, with a default when it is missing', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(429, { error: 'too_many_requests' }, { 'Retry-After': '42' })
    )
    fetchMock.mockResolvedValueOnce(reply(429, { error: 'too_many_requests' }))

    expect(await sendJoinRegistration(TOKEN, { displayName: 'A' })).toEqual({
      ok: false,
      reason: 'too_many_requests',
      retryAfterSeconds: 42,
    })
    expect(await sendJoinRegistration(TOKEN, { displayName: 'A' })).toEqual({
      ok: false,
      reason: 'too_many_requests',
      retryAfterSeconds: 60,
    })
  })

  it('reports a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await sendJoinRegistration(TOKEN, { displayName: 'A' })).toEqual({
      ok: false,
      reason: 'network',
    })
  })
})
