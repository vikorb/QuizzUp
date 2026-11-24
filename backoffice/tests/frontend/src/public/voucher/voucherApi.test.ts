import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lookupVoucher } from '@/public/voucher/voucherApi'

const CODE = 'ABCD-1234'
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

describe('public/voucher/voucherApi — lookupVoucher', () => {
  it('posts the code in the body, never in the address', async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        label: 'Café',
        companyName: 'Centre',
        logoUrl: null,
        expiresAt: '2027-03-10T10:00:00.000Z',
        state: 'valid',
      })
    )

    const result = await lookupVoucher(CODE)

    expect(result).toMatchObject({ ok: true, data: { label: 'Café', state: 'valid' } })

    const [url, init] = fetchMock.mock.calls[0]!

    expect(url).toBe('http://api.test/public/v1/vouchers/lookup')
    expect(String(url)).not.toContain(CODE)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ code: CODE })
    expect(init.credentials).toBeUndefined()
  })

  it('makes the logo path absolute: the API serves it, not the page origin', async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        label: 'Café',
        companyName: 'Centre',
        logoUrl: '/public/v1/logos/x.png',
        expiresAt: '2027-03-10T10:00:00.000Z',
        state: 'valid',
      })
    )

    expect(await lookupVoucher(CODE)).toMatchObject({
      ok: true,
      data: { logoUrl: 'http://api.test/public/v1/logos/x.png' },
    })
  })

  it.each([
    [404, { error: 'voucher_not_found' }, 'not_found'],
    [400, { error: 'invalid_body' }, 'not_found'],
    [500, { error: 'server_error' }, 'server'],
    [502, null, 'server'],
  ])('maps %s to the reason %s', async (status, body, reason) => {
    fetchMock.mockResolvedValue(reply(status, body))

    expect(await lookupVoucher(CODE)).toEqual({ ok: false, reason })
  })

  it('reads Retry-After on a 429, with a default when it is missing', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(429, { error: 'too_many_requests' }, { 'Retry-After': '12' })
    )
    fetchMock.mockResolvedValueOnce(reply(429, { error: 'too_many_requests' }))

    expect(await lookupVoucher(CODE)).toEqual({
      ok: false,
      reason: 'too_many_requests',
      retryAfterSeconds: 12,
    })
    expect(await lookupVoucher(CODE)).toMatchObject({ retryAfterSeconds: 60 })
  })

  it.each([
    ['an unknown state', { state: 'weird' }],
    ['no state', { state: undefined }],
    ['a label that is not text', { label: 42 }],
    ['a valid voucher with an unreadable date', { expiresAt: 'not a date' }],
    ['a valid voucher with no date', { expiresAt: undefined }],
    ['an expired voucher with an unreadable date', { state: 'expired', expiresAt: 'x' }],
  ])('treats a 200 with %s as a server error', async (_name, change) => {
    fetchMock.mockResolvedValue(
      reply(200, {
        label: 'Café',
        companyName: 'Centre',
        logoUrl: null,
        expiresAt: '2027-03-10T10:00:00.000Z',
        state: 'valid',
        ...change,
      })
    )

    expect(await lookupVoucher(CODE)).toEqual({ ok: false, reason: 'server' })
  })

  it('accepts a used voucher whose date is not needed', async () => {
    fetchMock.mockResolvedValue(
      reply(200, { label: 'Café', companyName: 'Centre', logoUrl: null, state: 'redeemed' })
    )

    expect(await lookupVoucher(CODE)).toMatchObject({ ok: true, data: { state: 'redeemed' } })
  })

  it('reports a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await lookupVoucher(CODE)).toEqual({ ok: false, reason: 'network' })
  })
})
