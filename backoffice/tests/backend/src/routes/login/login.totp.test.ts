import '../_helpers/registerDbMock'

import fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TOTP_RECOVERY_CODES_COUNT } from '@quizzup/shared'

import authPlugin from '../../../../../backend/src/plugins/auth'
import {
  confirmEnrollment,
  countUnusedRecoveryCodes,
  getAdminTotp,
  startEnrollment,
  verifySecondFactor,
} from '../../../../../backend/src/security/adminTotp'
import { openSecret, parseTotpKey, sealSecret } from '../../../../../backend/src/security/secretBox'
import {
  base32Decode,
  generateSecret,
  stepAt,
  totpCode,
} from '../../../../../backend/src/security/totp'
import authRoutes from '../../../../../backend/src/routes/auth'
import loginRoutes from '../../../../../backend/src/routes/login'
import { dbState, MOCK_NOW, resetDb } from '../_helpers/mockDb'

// Le magasin PostgreSQL (UPDATE atomiques, verrou, anti-rejeu) est prouvé sur la vraie base par
// `security/adminTotp.pg.test.ts` ; ici on vérifie ce que la route en fait.
vi.mock('../../../../../backend/src/security/adminTotp', () => ({
  getAdminTotp: vi.fn(),
  startEnrollment: vi.fn(),
  confirmEnrollment: vi.fn(),
  verifySecondFactor: vi.fn(),
  countUnusedRecoveryCodes: vi.fn(),
  resetAdminTotp: vi.fn(),
}))

process.env.JWT_SECRET ??= 'test-jwt-secret'

// Plages de documentation (RFC 5737) : aucune adresse réelle.
const OPERATOR = '192.0.2.10'
const OUTSIDE = '198.51.100.9'

const KEY = parseTotpKey(process.env.TOTP_ENCRYPTION_KEY) as Buffer

type Jwt = {
  sign: (payload: Record<string, unknown>, options?: Record<string, unknown>) => string
}

const jwtOf = (app: FastifyInstance) => (app as unknown as { jwt: Jwt }).jwt

async function start() {
  const app = fastify({ logger: false })
  await app.register(authPlugin as never)
  await app.register(authRoutes as never)
  await app.register(loginRoutes as never)
  await app.ready()

  return app
}

function challenge(app: FastifyInstance, adminId = 1, expiresIn = '5m'): string {
  return jwtOf(app).sign({ sub: String(adminId), typ: 'mfa_challenge' }, { expiresIn })
}

function post(app: FastifyInstance, url: string, payload: unknown, remoteAddress = OPERATOR) {
  return app.inject({ method: 'POST', url, payload: payload as object, remoteAddress })
}

beforeEach(() => {
  for (const mocked of [
    getAdminTotp,
    startEnrollment,
    confirmEnrollment,
    verifySecondFactor,
    countUnusedRecoveryCodes,
  ]) {
    vi.mocked(mocked).mockReset()
  }
  resetDb()
  vi.stubEnv('CONSOLE_ALLOWED_CIDRS', '192.0.2.0/24')
  vi.stubEnv('TRUST_PROXY', '')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('routes/login — garde commune des routes de défi', () => {
  const routes = ['/login/totp', '/login/totp/enroll', '/login/totp/enroll/confirm']

  it.each(routes)(
    'POST %s est refusée hors des adresses de la console, jeton valide compris',
    async (url) => {
      const app = await start()

      const response = await post(
        app,
        url,
        { challengeToken: challenge(app), code: '123456' },
        OUTSIDE
      )

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({ error: 'forbidden' })
      expect(verifySecondFactor).not.toHaveBeenCalled()
      expect(startEnrollment).not.toHaveBeenCalled()
      expect(dbState.admin_sessions).toHaveLength(0)

      await app.close()
    }
  )

  it.each(routes)('POST %s rejette un corps invalide en 400', async (url) => {
    const app = await start()

    for (const payload of [
      {},
      { challengeToken: '', code: '123456' },
      { code: '123456' },
      { challengeToken: 123, code: '123456' },
    ]) {
      expect((await post(app, url, payload)).statusCode, JSON.stringify(payload)).toBe(400)
    }

    await app.close()
  })

  it('limite les appels à 10 par minute et par adresse, avec Retry-After', async () => {
    const app = await start()

    for (let i = 0; i < 10; i += 1) {
      expect(
        (await post(app, '/login/totp', { challengeToken: 'x', code: '123456' })).statusCode
      ).toBe(401)
    }

    const blocked = await post(app, '/login/totp', { challengeToken: 'x', code: '123456' })

    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toEqual({ error: 'too_many_requests' })
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    // Une autre adresse de la console n'est pas touchée.
    expect(
      (await post(app, '/login/totp', { challengeToken: 'x', code: '123456' }, '192.0.2.77'))
        .statusCode
    ).toBe(401)

    await app.close()
  })

  it.each(routes)(
    'POST %s : un jeton qui n’est pas un défi valide donne 401 mfa_challenge_invalid',
    async (url) => {
      const app = await start()
      const sign = jwtOf(app).sign
      const bodyOf = (token: string) => ({ challengeToken: token, code: '123456' })

      const tokens = {
        garbage: 'pas.un.jeton',
        // Jeton de session normal : porte un `sid`, pas de `typ`.
        session: sign(
          { sub: '1', company_id: 1, role: 'superadmin', sid: 'sid-1' },
          { expiresIn: '7d' }
        ),
        // `typ` juste mais `sid` en plus : une session ne se fabrique pas à partir d'un défi.
        withSid: sign({ sub: '1', typ: 'mfa_challenge', sid: 'sid-1' }, { expiresIn: '5m' }),
        otherType: sign({ sub: '1', typ: 'autre' }, { expiresIn: '5m' }),
        // Un défi pour un compte qui n'est pas superadmin (alice, id 2).
        notSuperadmin: challenge(app, 2),
        unknownAccount: challenge(app, 999),
        badSubject: sign({ sub: 'abc', typ: 'mfa_challenge' }, { expiresIn: '5m' }),
      }

      for (const [name, token] of Object.entries(tokens)) {
        const response = await post(app, url, bodyOf(token))
        expect(response.statusCode, name).toBe(401)
        expect(response.json(), name).toEqual({ error: 'mfa_challenge_invalid' })
      }

      await app.close()
    }
  )

  it('refuse le défi d’un superadmin désactivé', async () => {
    const root = dbState.admins.find((row) => row.id === 1)
    if (root) root.status = 0
    const app = await start()

    const response = await post(app, '/login/totp', {
      challengeToken: challenge(app),
      code: '123456',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'mfa_challenge_invalid' })

    await app.close()
  })

  it('refuse un défi signé avec un autre secret', async () => {
    const other = fastify({ logger: false })
    vi.stubEnv('JWT_SECRET', 'another-secret-that-is-not-the-real-one')
    await other.register(authPlugin as never)
    await other.ready()
    const forged = challenge(other)
    vi.unstubAllEnvs()
    vi.stubEnv('CONSOLE_ALLOWED_CIDRS', '192.0.2.0/24')
    const app = await start()

    const response = await post(app, '/login/totp', { challengeToken: forged, code: '123456' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'mfa_challenge_invalid' })

    await app.close()
    await other.close()
  })

  it('expire au bout de 5 minutes : valable à 4 min 59 s, refusé à 5 min 01 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z'))
    const app = await start()
    const token = challenge(app)
    vi.mocked(verifySecondFactor).mockResolvedValue({ ok: false, reason: 'invalid' })

    vi.setSystemTime(new Date('2026-11-23T10:04:59Z'))
    const early = await post(app, '/login/totp', { challengeToken: token, code: '123456' })
    expect(early.json()).toEqual({ error: 'totp_invalid' })

    vi.setSystemTime(new Date('2026-11-23T10:05:01Z'))
    const late = await post(app, '/login/totp', { challengeToken: token, code: '123456' })
    expect(late.statusCode).toBe(401)
    expect(late.json()).toEqual({ error: 'mfa_challenge_invalid' })

    await app.close()
  })

  it('répond 503 totp_unavailable sans clé valide, sans toucher au magasin', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', '')
    const app = await start()

    for (const url of ['/login/totp', '/login/totp/enroll', '/login/totp/enroll/confirm']) {
      const response = await post(app, url, { challengeToken: challenge(app), code: '123456' })

      expect(response.statusCode, url).toBe(503)
      expect(response.json(), url).toEqual({ error: 'totp_unavailable' })
    }
    expect(verifySecondFactor).not.toHaveBeenCalled()
    expect(startEnrollment).not.toHaveBeenCalled()
    expect(getAdminTotp).not.toHaveBeenCalled()

    await app.close()
  })
})

describe('routes/login — un défi n’est pas un jeton de session', () => {
  it('est refusé comme jeton porteur sur toute route authentifiée, même avec une session valide', async () => {
    dbState.admin_sessions.push({
      id: 'sid-1',
      admin_id: 1,
      created_at: MOCK_NOW,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    })
    const app = await start()
    // `sid` d'une vraie session en plus de `typ` : seul le refus explicite de `typ` l'arrête.
    const token = jwtOf(app).sign({
      sub: '1',
      typ: 'mfa_challenge',
      sid: 'sid-1',
      role: 'superadmin',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/logout',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: OPERATOR,
    })

    expect(response.statusCode).toBe(401)
    expect(dbState.admin_sessions[0].revoked_at).toBeNull()

    await app.close()
  })
})

describe('POST /login/totp', () => {
  const body = (app: FastifyInstance, code = '123456') => ({
    challengeToken: challenge(app),
    code,
  })

  it('ouvre une session et rend le jeton porteur après un code juste', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({ ok: true, recoveryCode: false })
    const app = await start()

    const response = await post(app, '/login/totp', body(app))

    expect(response.statusCode).toBe(200)
    const json = response.json<{ token: string; admin: Record<string, unknown> }>()
    expect(json.admin).toMatchObject({ id: 1, role: 'superadmin', username: 'root' })
    expect(json.admin).not.toHaveProperty('mdp_hash')
    expect(json).not.toHaveProperty('recoveryCodesRemaining')
    expect(dbState.admin_sessions).toHaveLength(1)
    expect(dbState.admin_sessions[0]).toMatchObject({ admin_id: 1 })

    // Le jeton rendu est un vrai jeton de session : accepté par `authenticate`.
    const logout = await app.inject({
      method: 'POST',
      url: '/logout',
      headers: { authorization: `Bearer ${json.token}` },
      remoteAddress: OPERATOR,
    })
    expect(logout.statusCode).toBe(200)
    expect(dbState.admin_sessions[0].revoked_at).not.toBeNull()

    await app.close()
  })

  it('transmet au magasin l’admin du défi, la saisie sans espaces et la clé', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({ ok: false, reason: 'invalid' })
    const app = await start()

    await post(app, '/login/totp', body(app, '123 456'))

    expect(verifySecondFactor).toHaveBeenCalledWith(1, '123456', KEY, expect.any(Date))

    await app.close()
  })

  it('annonce les codes de secours restants après un code de secours', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({ ok: true, recoveryCode: true })
    vi.mocked(countUnusedRecoveryCodes).mockResolvedValue(8)
    const app = await start()

    const response = await post(app, '/login/totp', body(app, 'abcde-fghij'))

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ recoveryCodesRemaining: 8 })
    expect(countUnusedRecoveryCodes).toHaveBeenCalledWith(1)

    await app.close()
  })

  it('répond 401 totp_invalid pour un code faux, sans session', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({ ok: false, reason: 'invalid' })
    const app = await start()

    const response = await post(app, '/login/totp', body(app))

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'totp_invalid' })
    expect(dbState.admin_sessions).toHaveLength(0)

    await app.close()
  })

  it('répond 429 too_many_attempts avec Retry-After pendant le blocage, sans session', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({
      ok: false,
      reason: 'locked',
      retryAfterSeconds: 840,
    })
    const app = await start()

    const response = await post(app, '/login/totp', body(app))

    expect(response.statusCode).toBe(429)
    expect(response.json()).toEqual({ error: 'too_many_attempts' })
    expect(response.headers['retry-after']).toBe('840')
    expect(dbState.admin_sessions).toHaveLength(0)

    await app.close()
  })

  it('répond 409 totp_not_enrolled quand le superadmin n’a pas de deuxième facteur', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({ ok: false, reason: 'not_enrolled' })
    const app = await start()

    const response = await post(app, '/login/totp', body(app))

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'totp_not_enrolled' })

    await app.close()
  })
})

describe('POST /login/totp/enroll', () => {
  it('génère un secret, le range chiffré pour cet admin et rend la clé et l’adresse otpauth', async () => {
    vi.mocked(startEnrollment).mockResolvedValue(true)
    const app = await start()

    const response = await post(app, '/login/totp/enroll', { challengeToken: challenge(app) })

    expect(response.statusCode).toBe(200)
    const { secret, otpauthUrl } = response.json<{ secret: string; otpauthUrl: string }>()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)

    const url = new URL(otpauthUrl)
    expect(url.searchParams.get('secret')).toBe(secret)
    expect(url.searchParams.get('issuer')).toBe('QuizzUp')
    expect(decodeURIComponent(url.pathname)).toBe('/QuizzUp:root')

    // Le magasin ne reçoit que le chiffré, lié à l'admin 1.
    const [adminId, sealed] = vi.mocked(startEnrollment).mock.calls[0]
    expect(adminId).toBe(1)
    expect(sealed).not.toContain(secret)
    expect(openSecret(KEY, 1, sealed)).toBe(secret)
    expect(() => openSecret(KEY, 2, sealed)).toThrow()

    await app.close()
  })

  it('utilise TOTP_ISSUER quand il est réglé', async () => {
    vi.stubEnv('TOTP_ISSUER', 'Acme Quiz')
    vi.mocked(startEnrollment).mockResolvedValue(true)
    const app = await start()

    const response = await post(app, '/login/totp/enroll', { challengeToken: challenge(app) })
    const url = new URL(response.json<{ otpauthUrl: string }>().otpauthUrl)

    expect(url.searchParams.get('issuer')).toBe('Acme Quiz')

    await app.close()
  })

  it('répond 409 totp_already_enrolled quand le deuxième facteur est déjà confirmé', async () => {
    vi.mocked(startEnrollment).mockResolvedValue(false)
    const app = await start()

    const response = await post(app, '/login/totp/enroll', { challengeToken: challenge(app) })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'totp_already_enrolled' })

    await app.close()
  })
})

describe('POST /login/totp/enroll/confirm', () => {
  const NOW = new Date('2026-11-23T10:00:00Z')
  const SECRET = generateSecret()
  const codeNow = (offsetSteps = 0) =>
    totpCode(base32Decode(SECRET), stepAt(NOW.getTime()) + offsetSteps)

  function pendingRecord(confirmedAt: Date | null = null) {
    return {
      secretEnc: sealSecret(KEY, 1, SECRET),
      confirmedAt,
      lastUsedStep: null,
      failedAttempts: 0,
      lockedUntil: null,
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  it('confirme avec le bon code, rend dix codes de secours et ouvre une session', async () => {
    vi.mocked(getAdminTotp).mockResolvedValue(pendingRecord())
    vi.mocked(confirmEnrollment).mockResolvedValue(true)
    const app = await start()

    const response = await post(app, '/login/totp/enroll/confirm', {
      challengeToken: challenge(app),
      code: codeNow(),
    })

    expect(response.statusCode).toBe(200)
    const json = response.json<{ token: string; admin: { id: number }; recoveryCodes: string[] }>()
    expect(json.admin.id).toBe(1)
    expect(json.recoveryCodes).toHaveLength(TOTP_RECOVERY_CODES_COUNT)
    expect(dbState.admin_sessions).toHaveLength(1)

    // Le magasin reçoit le pas du code, et exactement les codes que le client a reçus.
    expect(confirmEnrollment).toHaveBeenCalledWith(
      1,
      stepAt(NOW.getTime()),
      json.recoveryCodes,
      NOW
    )

    await app.close()
  })

  it('accepte le code du pas voisin (écart d’horloge)', async () => {
    vi.mocked(getAdminTotp).mockResolvedValue(pendingRecord())
    vi.mocked(confirmEnrollment).mockResolvedValue(true)
    const app = await start()

    const response = await post(app, '/login/totp/enroll/confirm', {
      challengeToken: challenge(app),
      code: codeNow(-1),
    })

    expect(response.statusCode).toBe(200)
    expect(confirmEnrollment).toHaveBeenCalledWith(
      1,
      stepAt(NOW.getTime()) - 1,
      expect.any(Array),
      NOW
    )

    await app.close()
  })

  it('répond 401 totp_invalid pour un code faux, sans rien enregistrer ni ouvrir de session', async () => {
    vi.mocked(getAdminTotp).mockResolvedValue(pendingRecord())
    const app = await start()

    const wrong = codeNow() === '000000' ? '000001' : '000000'
    const response = await post(app, '/login/totp/enroll/confirm', {
      challengeToken: challenge(app),
      code: wrong,
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'totp_invalid' })
    expect(confirmEnrollment).not.toHaveBeenCalled()
    expect(dbState.admin_sessions).toHaveLength(0)

    await app.close()
  })

  it('répond 409 totp_not_enrolled quand l’enrôlement n’a pas commencé', async () => {
    vi.mocked(getAdminTotp).mockResolvedValue(undefined)
    const app = await start()

    const response = await post(app, '/login/totp/enroll/confirm', {
      challengeToken: challenge(app),
      code: codeNow(),
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'totp_not_enrolled' })

    await app.close()
  })

  it('répond 409 totp_already_enrolled quand le facteur est déjà confirmé, ou le devient en parallèle', async () => {
    vi.mocked(getAdminTotp).mockResolvedValue(pendingRecord(NOW))
    const app = await start()
    const confirmed = await post(app, '/login/totp/enroll/confirm', {
      challengeToken: challenge(app),
      code: codeNow(),
    })

    expect(confirmed.statusCode).toBe(409)
    expect(confirmed.json()).toEqual({ error: 'totp_already_enrolled' })

    vi.mocked(getAdminTotp).mockResolvedValue(pendingRecord())
    vi.mocked(confirmEnrollment).mockResolvedValue(false)
    const raced = await post(app, '/login/totp/enroll/confirm', {
      challengeToken: challenge(app),
      code: codeNow(),
    })

    expect(raced.statusCode).toBe(409)
    expect(raced.json()).toEqual({ error: 'totp_already_enrolled' })
    expect(dbState.admin_sessions).toHaveLength(0)

    await app.close()
  })

  it('exige six chiffres', async () => {
    const app = await start()

    for (const code of ['12345', '1234567', 'abcdef', 'abcde-fghij']) {
      const response = await post(app, '/login/totp/enroll/confirm', {
        challengeToken: challenge(app),
        code,
      })

      expect(response.statusCode, code).toBe(400)
    }

    await app.close()
  })
})
