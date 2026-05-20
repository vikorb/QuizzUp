import fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { expect, vi } from 'vitest'

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
  })

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

  await app.register(plugin as never)
  await app.ready()

  return app
}

export function parseJson<T = Record<string, unknown>>(response: { json: () => unknown }): T {
  return response.json() as T
}

export function expectPublicAdmin(admin: Record<string, unknown>): void {
  expect(admin).not.toHaveProperty('mdp_hash')
  expect(admin).not.toHaveProperty('password')
}
