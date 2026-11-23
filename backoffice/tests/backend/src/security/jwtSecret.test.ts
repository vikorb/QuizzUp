import '../routes/_helpers/registerDbMock'

import fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

import authPlugin from '../../../../backend/src/plugins/auth'
import {
  assertJwtSecretIsSafe,
  DEV_JWT_SECRET,
  JWT_SECRET_MIN_LENGTH,
} from '@backend/security/jwtSecret'

const STRONG_SECRET = 'a'.repeat(JWT_SECRET_MIN_LENGTH)

describe('security/jwtSecret — garde-fou de production', () => {
  it('accepts any secret outside production (dev and tests keep their short secret)', () => {
    expect(() => assertJwtSecretIsSafe(DEV_JWT_SECRET, undefined)).not.toThrow()
    expect(() => assertJwtSecretIsSafe('x', 'development')).not.toThrow()
    expect(() => assertJwtSecretIsSafe('x', 'test')).not.toThrow()
  })

  it('accepts a long secret in production', () => {
    expect(() => assertJwtSecretIsSafe(STRONG_SECRET, 'production')).not.toThrow()
  })

  it('refuses the development secret in production', () => {
    expect(() => assertJwtSecretIsSafe(DEV_JWT_SECRET, 'production')).toThrow(/JWT_SECRET/)
  })

  it('refuses a secret shorter than the minimum in production', () => {
    expect(() =>
      assertJwtSecretIsSafe('a'.repeat(JWT_SECRET_MIN_LENGTH - 1), 'production')
    ).toThrow(/JWT_SECRET/)
    expect(() => assertJwtSecretIsSafe('', 'production')).toThrow(/JWT_SECRET/)
  })
})

describe('plugins/auth.ts — démarrage en production', () => {
  // stubEnv(nom, undefined) supprime la variable ; unstubAllEnvs la remet comme elle était (absente
  // comprise : affecter `undefined` à process.env y écrirait la chaîne « undefined »).
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function boot(secret: string | undefined, nodeEnv: string): Promise<void> {
    vi.stubEnv('JWT_SECRET', secret)
    vi.stubEnv('NODE_ENV', nodeEnv)

    const app = fastify({ logger: false })
    await app.register(authPlugin as never)
    await app.ready()
    await app.close()
  }

  it('refuses to start without a secret', async () => {
    await expect(boot(undefined, 'production')).rejects.toThrow(/JWT_SECRET/)
  })

  it('refuses to start in production with the development secret', async () => {
    await expect(boot(DEV_JWT_SECRET, 'production')).rejects.toThrow(/JWT_SECRET/)
  })

  it('refuses to start in production with a short secret', async () => {
    await expect(boot('court', 'production')).rejects.toThrow(/JWT_SECRET/)
  })

  it('starts in production with a long secret', async () => {
    await expect(boot(STRONG_SECRET, 'production')).resolves.toBeUndefined()
  })

  it('keeps starting outside production with the development secret', async () => {
    await expect(boot(DEV_JWT_SECRET, 'test')).resolves.toBeUndefined()
  })
})
