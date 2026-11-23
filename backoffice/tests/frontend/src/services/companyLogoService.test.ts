import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as LogoService from '@/services/companyLogoService'

const apiFetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/utils/api', () => ({
  apiFetch: apiFetchMock,
}))

// Le service est mocké globalement pour les composants : ici on teste le vrai module.
const service = await vi.importActual<typeof LogoService>('@/services/companyLogoService')

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const png = new File(['png'], 'logo.png', { type: 'image/png' })
const LOGO_URL = '/public/v1/logos/11111111-1111-4111-8111-111111111111.png'

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe('services/companyLogoService — upload', () => {
  it('sends the raw file with its own type and returns the public URL', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { logoUrl: LOGO_URL }))

    await expect(service.uploadCompanyLogoService(7, png)).resolves.toEqual({
      ok: true,
      data: { logoUrl: LOGO_URL },
    })

    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({
      path: '/companies/7/logo',
      method: 'PUT',
      authenticated: true,
      headers: { 'Content-Type': 'image/png' },
      body: png,
    })
  })

  it('maps an unreachable API (no response) to api_unreachable', async () => {
    apiFetchMock.mockResolvedValue(null)

    await expect(service.uploadCompanyLogoService(7, png)).resolves.toEqual({
      ok: false,
      error: 'api_unreachable',
    })
  })

  it('maps 413 to logo_too_large even without a body', async () => {
    apiFetchMock.mockResolvedValue(new Response('', { status: 413 }))

    await expect(service.uploadCompanyLogoService(7, png)).resolves.toEqual({
      ok: false,
      error: 'logo_too_large',
    })
  })

  it.each(['logo_type_invalid', 'logo_too_large', 'forbidden', 'not_found', 'unauthorized'])(
    'keeps the known API code %s',
    async (code) => {
      apiFetchMock.mockResolvedValue(jsonResponse(400, { error: code }))

      await expect(service.uploadCompanyLogoService(7, png)).resolves.toEqual({
        ok: false,
        error: code,
      })
    }
  )

  it('falls back to forbidden on a bare 403 and to server_error otherwise', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response('nope', { status: 403 }))
    apiFetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'something_new' }))

    await expect(service.uploadCompanyLogoService(7, png)).resolves.toEqual({
      ok: false,
      error: 'forbidden',
    })
    await expect(service.uploadCompanyLogoService(7, png)).resolves.toEqual({
      ok: false,
      error: 'server_error',
    })
  })

  it('treats a success without logoUrl as a server error', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, {}))

    await expect(service.uploadCompanyLogoService(7, png)).resolves.toEqual({
      ok: false,
      error: 'server_error',
    })
  })
})

describe('services/companyLogoService — delete', () => {
  it('calls DELETE and accepts the empty 204 answer', async () => {
    apiFetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(service.deleteCompanyLogoService(7)).resolves.toEqual({ ok: true, data: null })

    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({
      path: '/companies/7/logo',
      method: 'DELETE',
      authenticated: true,
    })
  })

  it('maps API errors like the upload', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'not_found' }))
    apiFetchMock.mockResolvedValueOnce(null)

    await expect(service.deleteCompanyLogoService(7)).resolves.toEqual({
      ok: false,
      error: 'not_found',
    })
    await expect(service.deleteCompanyLogoService(7)).resolves.toEqual({
      ok: false,
      error: 'api_unreachable',
    })
  })
})
