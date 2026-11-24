import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { LIVE_EVENT } from '@quizzup/shared'
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

/** Identifiants reçus par chaque abonné : le personnel et les salles de deux compagnies. */
export type GameUpdates = {
  /** Personnel de la compagnie 1 et de la compagnie 2. */
  staff1: unknown[]
  staff2: unknown[]
  /** Flux de la salle 1 (compagnie 1), de la salle 2 (compagnie 1) et de la salle 3 (compagnie 2). */
  room1: unknown[]
  room2: unknown[]
  room3: unknown[]
}

/** Abonne des faux flux et relève les `game_updated` reçus (ni nom ni e-mail : l'identifiant seul). */
export function watchGameUpdates(app: FastifyInstance): GameUpdates {
  const hub = liveHubOf(app)
  const sinkInto = (received: unknown[]) => ({
    send: (event: string, data: unknown) => {
      if (event === LIVE_EVENT.GAME_UPDATED) {
        received.push(data)
      }
    },
    close: () => undefined,
  })
  const updates: GameUpdates = { staff1: [], staff2: [], room1: [], room2: [], room3: [] }

  hub.subscribeStaff(1, 90, sinkInto(updates.staff1))
  hub.subscribeStaff(2, 91, sinkInto(updates.staff2))
  hub.openRoomStream(1, 1, sinkInto(updates.room1))
  hub.openRoomStream(2, 1, sinkInto(updates.room2))
  hub.openRoomStream(3, 2, sinkInto(updates.room3))

  return updates
}

/** Le personnel et la salle 1 de la compagnie 1 reçoivent la partie ; aucun autre abonné ne reçoit rien. */
export function expectOnlyCompany1Notified(updates: GameUpdates, gameId = 1): void {
  expect(updates.staff1).toEqual([{ gameId }])
  expect(updates.room1).toEqual([{ gameId }])
  expect(updates.staff2).toEqual([])
  expect(updates.room2).toEqual([])
  expect(updates.room3).toEqual([])
}

export function expectNobodyNotified(updates: GameUpdates): void {
  Object.values(updates).forEach((received) => expect(received).toEqual([]))
}

export function parseJson<T = Record<string, unknown>>(response: { json: () => unknown }): T {
  return response.json() as T
}

export function expectPublicAdmin(admin: Record<string, unknown>): void {
  expect(admin).not.toHaveProperty('mdp_hash')
  expect(admin).not.toHaveProperty('password')
}
