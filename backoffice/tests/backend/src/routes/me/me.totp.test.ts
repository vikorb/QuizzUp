import '../_helpers/registerDbMock'

import fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import authPlugin from '../../../../../backend/src/plugins/auth'
import meRoutes from '../../../../../backend/src/routes/me'
import { resetAdminTotp, verifySecondFactor } from '../../../../../backend/src/security/adminTotp'
import { parseTotpKey } from '../../../../../backend/src/security/secretBox'
import { dbState, MOCK_NOW, resetDb } from '../_helpers/mockDb'

// La révocation réelle des sessions et l'effacement des lignes sont prouvés sur PostgreSQL par
// `security/adminTotp.pg.test.ts` ; ici on vérifie la route : droits, code, réponses.
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

async function start() {
  const app = fastify({ logger: false })
  await app.register(authPlugin as never)
  await app.register(meRoutes as never)
  await app.ready()

  return app
}

let sessionCount = 0

/**
 * Session neuve en base et jeton porteur correspondant, pour l'admin donné. Une par requête : le
 * mock de la base date `last_seen_at` de 2026-05, la session serait périmée à la requête suivante.
 */
function sessionOf(app: FastifyInstance, adminId: number, role: string) {
  sessionCount += 1
  const sid = `sid-${adminId}-${sessionCount}`
  dbState.admin_sessions.push({
    id: sid,
    admin_id: adminId,
    created_at: MOCK_NOW,
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
  })
  const token = (app as unknown as { jwt: Jwt }).jwt.sign({
    sub: String(adminId),
    company_id: 1,
    role,
    sid,
  })

  return { authorization: `Bearer ${token}` }
}

function deleteTotp(
  app: FastifyInstance,
  headers: Record<string, string>,
  payload: unknown = { code: '123456' },
  remoteAddress = OPERATOR
) {
  return app.inject({
    method: 'DELETE',
    url: '/me/totp',
    headers,
    payload: payload as object,
    remoteAddress,
  })
}

beforeEach(() => {
  for (const mocked of [verifySecondFactor, resetAdminTotp]) vi.mocked(mocked).mockReset()
  resetDb()
  vi.stubEnv('CONSOLE_ALLOWED_CIDRS', '192.0.2.0/24')
  vi.stubEnv('TRUST_PROXY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('DELETE /me/totp', () => {
  it('efface le deuxième facteur du superadmin après un code juste : 204', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({ ok: true, recoveryCode: false })
    const app = await start()

    const response = await deleteTotp(app, sessionOf(app, 1, 'superadmin'), { code: '123 456' })

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    expect(verifySecondFactor).toHaveBeenCalledWith(1, '123456', KEY, expect.any(Date))
    expect(resetAdminTotp).toHaveBeenCalledWith(1)

    await app.close()
  })

  it('accepte aussi un code de secours', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({ ok: true, recoveryCode: true })
    const app = await start()

    const response = await deleteTotp(app, sessionOf(app, 1, 'superadmin'), { code: 'abcde-fghij' })

    expect(response.statusCode).toBe(204)
    expect(verifySecondFactor).toHaveBeenCalledWith(1, 'abcde-fghij', KEY, expect.any(Date))
    expect(resetAdminTotp).toHaveBeenCalledWith(1)

    await app.close()
  })

  it('répond 401 totp_invalid pour un code faux, sans rien effacer', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({ ok: false, reason: 'invalid' })
    const app = await start()

    const response = await deleteTotp(app, sessionOf(app, 1, 'superadmin'))

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'totp_invalid' })
    expect(resetAdminTotp).not.toHaveBeenCalled()

    await app.close()
  })

  it('répond 429 too_many_attempts avec Retry-After pendant le blocage, sans rien effacer', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({
      ok: false,
      reason: 'locked',
      retryAfterSeconds: 600,
    })
    const app = await start()

    const response = await deleteTotp(app, sessionOf(app, 1, 'superadmin'))

    expect(response.statusCode).toBe(429)
    expect(response.json()).toEqual({ error: 'too_many_attempts' })
    expect(response.headers['retry-after']).toBe('600')
    expect(resetAdminTotp).not.toHaveBeenCalled()

    await app.close()
  })

  it('répond 409 totp_not_enrolled quand il n’y a rien à effacer', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({ ok: false, reason: 'not_enrolled' })
    const app = await start()

    const response = await deleteTotp(app, sessionOf(app, 1, 'superadmin'))

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'totp_not_enrolled' })
    expect(resetAdminTotp).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejette un corps sans code en 400', async () => {
    const app = await start()

    const statuses: number[] = []
    for (const payload of [{}, { code: '' }, { code: 123456 }]) {
      statuses.push((await deleteTotp(app, sessionOf(app, 1, 'superadmin'), payload)).statusCode)
    }
    expect(statuses).toEqual([400, 400, 400])
    expect(verifySecondFactor).not.toHaveBeenCalled()

    await app.close()
  })

  it('exige une connexion : 401 sans jeton', async () => {
    const app = await start()

    const response = await app.inject({
      method: 'DELETE',
      url: '/me/totp',
      payload: { code: '123456' },
      remoteAddress: OPERATOR,
    })

    expect(response.statusCode).toBe(401)
    expect(resetAdminTotp).not.toHaveBeenCalled()

    await app.close()
  })

  it('est réservée au superadmin : 403 pour un admin de centre', async () => {
    const app = await start()

    const response = await deleteTotp(app, sessionOf(app, 2, 'admin'))

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
    expect(verifySecondFactor).not.toHaveBeenCalled()
    expect(resetAdminTotp).not.toHaveBeenCalled()

    await app.close()
  })

  it('passe la garde réseau de la console : 403 hors des adresses autorisées', async () => {
    vi.mocked(verifySecondFactor).mockResolvedValue({ ok: true, recoveryCode: false })
    const app = await start()

    const response = await deleteTotp(
      app,
      sessionOf(app, 1, 'superadmin'),
      { code: '123456' },
      OUTSIDE
    )

    expect(response.statusCode).toBe(403)
    expect(resetAdminTotp).not.toHaveBeenCalled()

    await app.close()
  })

  it('répond 503 totp_unavailable sans clé de chiffrement valide', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', '')
    const app = await start()

    const response = await deleteTotp(app, sessionOf(app, 1, 'superadmin'))

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ error: 'totp_unavailable' })
    expect(resetAdminTotp).not.toHaveBeenCalled()

    await app.close()
  })
})
