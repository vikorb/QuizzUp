import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deleteDemoRequestService,
  loadDemoRequestsService,
  updateDemoRequestService,
} from '@/services/demoRequestsService'

const { apiFetchMock, apiRequestJsonMock, tokenMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  apiRequestJsonMock: vi.fn(),
  tokenMock: { value: null as string | null },
}))

vi.mock('@/state/authState', () => ({ token: tokenMock }))

vi.mock('@/utils/api', () => ({
  apiFetch: apiFetchMock,
  apiRequestJson: apiRequestJsonMock,
}))

describe('services/demoRequestsService', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    apiRequestJsonMock.mockReset()
    tokenMock.value = 'jwt'
  })

  it('lists the requests with the session token', async () => {
    await loadDemoRequestsService()

    expect(apiRequestJsonMock).toHaveBeenCalledWith({
      path: '/demo-requests',
      method: 'GET',
      authenticated: true,
    })
  })

  it('patches the processed flag of one request', async () => {
    await updateDemoRequestService(4, true)

    expect(apiRequestJsonMock).toHaveBeenCalledWith({
      path: '/demo-requests/4',
      method: 'PATCH',
      authenticated: true,
      headers: { 'Content-Type': 'application/json' },
      body: '{"processed":true}',
    })
  })

  it('reads the empty 204 answer of a deletion as a success', async () => {
    apiFetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    expect(await deleteDemoRequestService(4)).toEqual({ ok: true })
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/demo-requests/4',
      method: 'DELETE',
      authenticated: true,
    })
  })

  it('reads the error code of a refused deletion', async () => {
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    expect(await deleteDemoRequestService(4)).toEqual({ ok: false, error: 'not_found' })
  })

  it('falls back on server_error when the refusal carries no code', async () => {
    apiFetchMock.mockResolvedValue(new Response('boom', { status: 500 }))

    expect(await deleteDemoRequestService(4)).toEqual({ ok: false, error: 'server_error' })
  })

  it('answers missing_token without calling the API when there is no session', async () => {
    tokenMock.value = null

    expect(await deleteDemoRequestService(4)).toEqual({ ok: false, error: 'missing_token' })
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('answers api_unreachable when the request does not go through', async () => {
    apiFetchMock.mockResolvedValue(null)

    expect(await deleteDemoRequestService(4)).toEqual({ ok: false, error: 'api_unreachable' })
  })
})
