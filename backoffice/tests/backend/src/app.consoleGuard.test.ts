import './routes/_helpers/registerDbMock'

import { ADMIN_ROLE_SUPERADMIN } from '@quizzup/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../../backend/src/app'
import { dbState, MOCK_NOW, resetDb } from './routes/_helpers/mockDb'

// L'application réelle (buildApp : TRUST_PROXY, authentification, routes, permissions), sur la base
// en mémoire. Plages de documentation (RFC 5737 et 3849) : aucune adresse réelle.
const CONSOLE_NET = '192.0.2.0/24 2001:db8::/32'
const OPERATOR = '192.0.2.10'
const OUTSIDE = '198.51.100.9'
const OTHER_PUBLIC = '203.0.113.7'
const CADDY = '172.18.0.2'

type Decorations = { jwt: { sign: (payload: Record<string, unknown>) => string } }

type StartedApp = Awaited<ReturnType<typeof start>>

async function start() {
  const app = buildApp()
  await app.ready()

  return app
}

function seedSession(id: string, adminId: number): void {
  dbState.admin_sessions.push({
    id,
    admin_id: adminId,
    created_at: MOCK_NOW,
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
  })
}

function bearer(app: StartedApp, adminId: number, role: string): { authorization: string } {
  const token = (app as unknown as Decorations).jwt.sign({
    sub: String(adminId),
    company_id: 1,
    role,
    sid: `sid-${adminId}`,
  })

  return { authorization: `Bearer ${token}` }
}

describe('app.ts — garde réseau de la console éditeur', () => {
  beforeEach(() => {
    resetDb()
    seedSession('sid-1', 1)
    seedSession('sid-2', 2)
    vi.stubEnv('CONSOLE_ALLOWED_CIDRS', CONSOLE_NET)
    vi.stubEnv('TRUST_PROXY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // Une famille de routes par ligne : réservée au superadmin par la matrice, partagée par tous les
  // rôles, accès à une compagnie, flux en direct. La garde est dans `authenticate` : aucune ne la
  // recopie, aucune ne peut l'oublier.
  const guardedRoutes = [
    ['GET', '/companies'],
    ['GET', '/me'],
    ['GET', '/companies/1/rooms'],
    ['GET', '/companies/1/live'],
  ] as const

  it.each(guardedRoutes)(
    '%s %s answers 403 forbidden to a superadmin token outside the console',
    async (method, url) => {
      const app = await start()

      const response = await app.inject({
        method,
        url,
        remoteAddress: OUTSIDE,
        headers: bearer(app, 1, ADMIN_ROLE_SUPERADMIN),
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({ error: 'forbidden' })

      await app.close()
    }
  )

  it.each(guardedRoutes.filter(([, url]) => !url.endsWith('/live')))(
    '%s %s still answers a superadmin from the console',
    async (method, url) => {
      const app = await start()

      const response = await app.inject({
        method,
        url,
        remoteAddress: OPERATOR,
        headers: bearer(app, 1, ADMIN_ROLE_SUPERADMIN),
      })

      expect(response.statusCode).toBe(200)

      await app.close()
    }
  )

  it('keeps answering a company admin from any address', async () => {
    const app = await start()

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      remoteAddress: OUTSIDE,
      headers: bearer(app, 2, 'admin'),
    })

    expect(response.statusCode).toBe(200)

    await app.close()
  })

  it('revokes the session of a superadmin who logs out from outside the console, and opens no other route', async () => {
    const app = await start()
    const headers = bearer(app, 1, ADMIN_ROLE_SUPERADMIN)

    const logout = await app.inject({
      method: 'POST',
      url: '/logout',
      remoteAddress: OUTSIDE,
      headers,
    })

    expect(logout.statusCode).toBe(200)
    expect(logout.json()).toEqual({ ok: true })
    expect(
      dbState.admin_sessions.find((session) => session.id === 'sid-1')?.revoked_at
    ).not.toBeNull()

    // Le jeton est mort, même depuis la console.
    const fromConsole = await app.inject({
      method: 'GET',
      url: '/me',
      remoteAddress: OPERATOR,
      headers,
    })
    expect(fromConsole.statusCode).toBe(401)
    expect(fromConsole.json()).toEqual({ error: 'session_invalid' })

    await app.close()
  })

  it('still answers 403 to every other route of a superadmin outside the console, logout excepted', async () => {
    const app = await start()
    const headers = bearer(app, 1, ADMIN_ROLE_SUPERADMIN)

    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      remoteAddress: OUTSIDE,
      headers,
      payload: {},
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('refuses a superadmin from an IPv6 address outside the console, and accepts an allowed one', async () => {
    const app = await start()
    const headers = bearer(app, 1, ADMIN_ROLE_SUPERADMIN)
    const get = (remoteAddress: string) =>
      app.inject({ method: 'GET', url: '/companies', remoteAddress, headers })

    // Refus d'abord : une requête acceptée prolonge la session (horloge de la base simulée).
    expect((await get('3fff::5')).statusCode).toBe(403)
    expect((await get('2001:db8::5')).statusCode).toBe(200)

    await app.close()
  })

  it('closes the console to every superadmin when CONSOLE_ALLOWED_CIDRS is empty', async () => {
    vi.stubEnv('CONSOLE_ALLOWED_CIDRS', '')
    const app = await start()

    const response = await app.inject({
      method: 'GET',
      url: '/companies',
      remoteAddress: '127.0.0.1',
      headers: bearer(app, 1, ADMIN_ROLE_SUPERADMIN),
    })

    expect(response.statusCode).toBe(403)

    await app.close()
  })

  describe('behind a proxy (TRUST_PROXY)', () => {
    beforeEach(() => {
      vi.stubEnv('TRUST_PROXY', '172.18.0.0/16')
    })

    function companies(
      app: StartedApp,
      remoteAddress: string,
      forwardedFor: string | undefined
    ): Promise<{ statusCode: number }> {
      return app.inject({
        method: 'GET',
        url: '/companies',
        remoteAddress,
        headers: {
          ...bearer(app, 1, ADMIN_ROLE_SUPERADMIN),
          ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
        },
      })
    }

    it('judges the client address that the proxy forwards', async () => {
      const app = await start()

      // Refus d'abord : une requête acceptée prolonge la session (horloge de la base simulée).
      expect((await companies(app, CADDY, OTHER_PUBLIC)).statusCode).toBe(403)
      expect((await companies(app, CADDY, OPERATOR)).statusCode).toBe(200)

      await app.close()
    })

    it('refuses when the proxy sent the operator address after a public one (read from the right)', async () => {
      const app = await start()

      // « poste, publique » : la valeur retenue est celle que Caddy a ajoutée à droite.
      expect((await companies(app, CADDY, `${OPERATOR}, ${OTHER_PUBLIC}`)).statusCode).toBe(403)
      // Le client a forgé l'adresse publique en tête : seule la dernière, posée par le proxy, compte.
      expect((await companies(app, CADDY, `${OTHER_PUBLIC}, ${OPERATOR}`)).statusCode).toBe(200)

      await app.close()
    })

    it('ignores X-Forwarded-For from a peer that is not a trusted proxy', async () => {
      const app = await start()

      expect((await companies(app, OUTSIDE, OPERATOR)).statusCode).toBe(403)

      await app.close()
    })

    it('applies the same address to the login of a superadmin', async () => {
      const app = await start()
      const login = (forwardedFor: string) =>
        app.inject({
          method: 'POST',
          url: '/login',
          remoteAddress: CADDY,
          headers: { 'x-forwarded-for': forwardedFor },
          payload: { identifier: 'root', password: 'root-password' },
        })

      const outside = await login(OTHER_PUBLIC)
      expect(outside.statusCode).toBe(401)
      expect(outside.json()).toEqual({ error: 'invalid_credentials' })

      expect((await login(OPERATOR)).statusCode).toBe(200)

      await app.close()
    })
  })

  it('ignores X-Forwarded-For when TRUST_PROXY is unset', async () => {
    const app = await start()

    const response = await app.inject({
      method: 'GET',
      url: '/companies',
      remoteAddress: OUTSIDE,
      headers: { ...bearer(app, 1, ADMIN_ROLE_SUPERADMIN), 'x-forwarded-for': OPERATOR },
    })

    expect(response.statusCode).toBe(403)

    await app.close()
  })

  it('refuses to start on an invalid CONSOLE_ALLOWED_CIDRS', async () => {
    vi.stubEnv('CONSOLE_ALLOWED_CIDRS', `${CONSOLE_NET} 192.0.2.0/33`)
    const app = buildApp()

    await expect(app.ready()).rejects.toThrow(/CONSOLE_ALLOWED_CIDRS invalide/)
    await app.close()
  })
})
