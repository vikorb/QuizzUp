import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { expect, vi } from 'vitest'

import type { LiveHub } from '../../../../../backend/src/live/hub'
import liveHubPlugin from '../../../../../backend/src/plugins/liveHub'
import { createConsoleNetwork } from '../../../../../backend/src/security/consoleNetwork'
import { parseTotpKey } from '../../../../../backend/src/security/secretBox'

export type TestUser = {
  sub: string
  id?: number
  adminId?: number
  company_id: number
  companyId?: number
  role: string
  sid: string
}

export const jwtSignMock = vi.fn(() => 'test.jwt.token')

export const superadminUser: TestUser = {
  sub: '1',
  id: 1,
  adminId: 1,
  company_id: 1,
  companyId: 1,
  role: 'superadmin',
  sid: 'sid-root',
}

export const companyAdminUser: TestUser = {
  sub: '2',
  id: 2,
  adminId: 2,
  company_id: 1,
  companyId: 1,
  role: 'admin',
  sid: 'sid-alice',
}

export const companyUser: TestUser = {
  sub: '3',
  id: 3,
  adminId: 3,
  company_id: 2,
  companyId: 2,
  role: 'user',
  sid: 'sid-bob',
}

export function authHeaders(user: TestUser = superadminUser): Record<string, string> {
  return {
    'x-test-user': Buffer.from(JSON.stringify(user)).toString('base64'),
  }
}

export async function createRouteApp(plugin: unknown) {
  const app = fastify({ logger: false })

  app.decorate('jwt', {
    sign: jwtSignMock,
    verify: vi.fn(),
    decode: vi.fn(),
    lookupToken: vi.fn(),
    options: {},
  } as never)

  // Comme le plugin d'authentification : la variable est lue à la création de l'application.
  app.decorate('consoleNetwork', createConsoleNetwork(process.env.CONSOLE_ALLOWED_CIDRS))
  app.decorate('totpKey', parseTotpKey(process.env.TOTP_ENCRYPTION_KEY))

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawUser = req.headers['x-test-user']

    if (!rawUser) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }

    try {
      const serializedUser = Buffer.from(String(rawUser), 'base64').toString('utf8')
      ;(req as unknown as { user: unknown }).user = JSON.parse(serializedUser)
    } catch {
      reply.code(401).send({ error: 'unauthorized' })
    }
  })

  // Le hub du direct, comme dans `buildApp` : les routes du direct et l'arrêt d'une partie s'en servent.
  await app.register(liveHubPlugin as never)
  await app.register(plugin as never)
  await app.ready()

  return app
}

/** Le hub du direct de l'application (décoré par `plugins/liveHub`, hors du typage de ce programme). */
export function liveHubOf(app: FastifyInstance): LiveHub {
  return (app as unknown as { liveHub: LiveHub }).liveHub
}

export function parseJson<T = Record<string, unknown>>(response: { json: () => unknown }): T {
  return response.json() as T
}

export function expectPublicAdmin(admin: Record<string, unknown>): void {
  expect(admin).not.toHaveProperty('mdp_hash')
  expect(admin).not.toHaveProperty('password')
}
