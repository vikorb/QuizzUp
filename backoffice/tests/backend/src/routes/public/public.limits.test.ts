import '../_helpers/registerDbMock'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COMPANY_STATUS_ACTIVE } from '@quizzup/shared'
import { PUBLIC_RATE_LIMIT_MAX } from '@backend/routes/public/_shared'
import { dbState, resetDb } from '../_helpers/mockDb'
import { bearer, createPublicApp, PUBLIC_API_NOW, seedRoom, seedToken } from '../_helpers/publicApi'

type App = Awaited<ReturnType<typeof createPublicApp>>

let app: App

const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url, headers, remoteAddress: '203.0.113.7' })

beforeEach(async () => {
  resetDb()
  dbState.companies[1]!.status = COMPANY_STATUS_ACTIVE
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(PUBLIC_API_NOW)
  seedRoom({ id: 1 })
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('routes/public — limites de débit', () => {
  it('bounds a keyed call by its key, not by the per-address limit of the prefix', async () => {
    vi.stubEnv('PUBLIC_API_RATE_LIMIT_PER_MINUTE', '300')
    app = await createPublicApp()
    const { token } = seedToken()
    let last = await get('/public/v1/rooms', bearer(token))

    for (let i = 1; i <= PUBLIC_RATE_LIMIT_MAX; i += 1) {
      last = await get('/public/v1/rooms', bearer(token))
    }

    // Le 121e appel passe, avec ses en-têtes.
    expect(last.statusCode).toBe(200)
    expect(last.headers['ratelimit-limit']).toBe('300')
    expect(last.headers['ratelimit-remaining']).toBe(String(300 - PUBLIC_RATE_LIMIT_MAX - 1))
  })

  it('does not share a quota between two keys behind the same address', async () => {
    vi.stubEnv('PUBLIC_API_RATE_LIMIT_PER_MINUTE', '100')
    app = await createPublicApp()
    const a = seedToken()
    const b = seedToken()

    for (let i = 0; i < 100; i += 1)
      expect((await get('/public/v1/rooms', bearer(a.token))).statusCode).toBe(200)
    expect((await get('/public/v1/rooms', bearer(a.token))).statusCode).toBe(429)

    // 100 appels de A, puis B : au-delà des 120 de l'adresse, B répond encore 200 avec tout son quota.
    for (let i = 0; i < 100; i += 1)
      expect((await get('/public/v1/rooms', bearer(b.token))).statusCode).toBe(200)
  })

  it('keeps the per-address limit on a public route without key', async () => {
    app = await createPublicApp()

    for (let i = 0; i < PUBLIC_RATE_LIMIT_MAX; i += 1) await get('/public/v1/logos/absent.png')

    const blocked = await get('/public/v1/logos/absent.png')

    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toEqual({ error: 'too_many_requests' })
  })

  it('keeps the per-address limit on unknown paths of the prefix', async () => {
    app = await createPublicApp()

    for (let i = 0; i < PUBLIC_RATE_LIMIT_MAX; i += 1) await get('/public/v1/nope')

    expect((await get('/public/v1/nope')).statusCode).toBe(429)
  })
})
