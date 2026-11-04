import '../../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  COMPANY_STATUS_DELETED,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
  ROOM_STATUS_INACTIVE,
} from '@quizzup/shared'
import companyRoomsRoutes from '@backend/routes/companies/rooms'
import companyRoomIdRoutes from '@backend/routes/companies/rooms/id'
import companyRoomIdStatusRoutes from '@backend/routes/companies/rooms/idStatus'
import { dbState, MOCK_NOW, resetDb } from '../../_helpers/mockDb'
import { securityState } from '../../_helpers/mockSecurity'
import { resetRouteMocksBeforeEach } from '../../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  parseJson,
  superadminUser,
} from '../../_helpers/testApp'

resetRouteMocksBeforeEach()

function room(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    config: {},
    status: ROOM_STATUS_ACTIVE,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

type RoomsBody = { rooms: Array<Record<string, unknown>> }
type RoomBody = { room: Record<string, unknown> }

function seedRooms(...rooms: ReturnType<typeof room>[]) {
  resetDb({ rooms })
}

async function rooms() {
  const app = await createRouteApp(async (instance: never) => {
    const fastify = instance as { register: (plugin: unknown) => Promise<void> }
    await fastify.register(companyRoomsRoutes)
    await fastify.register(companyRoomIdRoutes)
    await fastify.register(companyRoomIdStatusRoutes)
  })

  return app
}

describe('routes/companies/rooms (US-ROOM-01)', () => {
  describe('GET /companies/:companyId/rooms', () => {
    it('lists the rooms of the company, deleted ones only for the superadmin', async () => {
      seedRooms(
        room(),
        room({ id: 2, name: 'Salle Rétro', status: ROOM_STATUS_DELETED, deleted_at: MOCK_NOW }),
        room({ id: 3, company_id: 2, name: 'Ailleurs' })
      )
      const app = await rooms()

      const asAdmin = await app.inject({
        method: 'GET',
        url: '/companies/1/rooms',
        headers: authHeaders(companyAdminUser),
      })
      const asSuperadmin = await app.inject({
        method: 'GET',
        url: '/companies/1/rooms',
        headers: authHeaders(superadminUser),
      })

      expect(asAdmin.statusCode).toBe(200)
      expect(parseJson<RoomsBody>(asAdmin).rooms.map((item) => item.id)).toEqual([1])
      expect(parseJson<RoomsBody>(asSuperadmin).rooms.map((item) => item.id)).toEqual([1, 2])
      expect(parseJson<RoomsBody>(asAdmin).rooms[0]).toMatchObject({
        companyId: 1,
        name: 'Salle Néon',
        config: {},
        status: ROOM_STATUS_ACTIVE,
      })

      await app.close()
    })

    it('returns the number of pupitres of each room, 4 by default, from 1 to 6', async () => {
      seedRooms(
        room({ id: 1, config: {} }),
        room({ id: 2, name: 'Six', config: { desksCount: 6 } }),
        room({ id: 3, name: 'Deux', config: { desksCount: 2 } }),
        room({ id: 4, name: 'Trop', config: { desksCount: 9 } }),
        room({ id: 5, name: 'Zéro', config: { desksCount: 0 } }),
        room({ id: 6, name: 'Texte', config: { desksCount: '5' } }),
        room({ id: 7, name: 'Décimal', config: { desksCount: 2.7 } }),
        room({ id: 8, name: 'Ancienne', config: { buzzers: { keymap: {} } } })
      )
      const app = await rooms()

      const response = await app.inject({
        method: 'GET',
        url: '/companies/1/rooms',
        headers: authHeaders(companyAdminUser),
      })

      expect(parseJson<RoomsBody>(response).rooms.map((item) => item.desksCount)).toEqual([
        4, 6, 2, 6, 1, 4, 2, 4,
      ])
      // La config est renvoyée telle quelle : seule la valeur lue est bornée.
      expect(parseJson<RoomsBody>(response).rooms[3]!.config).toEqual({ desksCount: 9 })

      await app.close()
    })

    it('forbids another company and missing permissions', async () => {
      const app = await rooms()

      const otherCompany = await app.inject({
        method: 'GET',
        url: '/companies/1/rooms',
        headers: authHeaders(companyUser),
      })

      securityState.hasPermission = false
      const noPermission = await app.inject({
        method: 'GET',
        url: '/companies/1/rooms',
        headers: authHeaders(companyAdminUser),
      })

      expect(otherCompany.statusCode).toBe(403)
      expect(noPermission.statusCode).toBe(403)

      await app.close()
    })

    it('rejects invalid params and unknown companies', async () => {
      const app = await rooms()

      const invalid = await app.inject({
        method: 'GET',
        url: '/companies/abc/rooms',
        headers: authHeaders(superadminUser),
      })
      const unknown = await app.inject({
        method: 'GET',
        url: '/companies/99/rooms',
        headers: authHeaders(superadminUser),
      })

      expect(invalid.statusCode).toBe(400)
      expect(unknown.statusCode).toBe(404)

      await app.close()
    })
  })

  describe('POST /companies/:companyId/rooms', () => {
    it('creates an active room with an empty config by default', async () => {
      const app = await rooms()

      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/rooms',
        headers: authHeaders(companyAdminUser),
        payload: { name: '  Salle Néon  ' },
      })

      expect(response.statusCode).toBe(201)
      expect(parseJson(response).room).toMatchObject({
        companyId: 1,
        name: 'Salle Néon',
        config: {},
        status: ROOM_STATUS_ACTIVE,
      })
      expect(dbState.rooms).toHaveLength(1)

      await app.close()
    })

    it('stores the hardware config', async () => {
      const app = await rooms()
      const config = { buzzers: { podiums: 4 }, smoke: { maxDurationMs: 3000 } }

      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/rooms',
        headers: authHeaders(companyAdminUser),
        payload: { name: 'Salle Néon', config },
      })

      expect(response.statusCode).toBe(201)
      expect(parseJson<RoomBody>(response).room.config).toEqual(config)

      await app.close()
    })

    it('accepts a desksCount from 1 to 6 and refuses anything else', async () => {
      const app = await rooms()
      const create = (desksCount: unknown) =>
        app.inject({
          method: 'POST',
          url: '/companies/1/rooms',
          headers: authHeaders(companyAdminUser),
          payload: { name: `Salle ${String(desksCount)}`, config: { desksCount } },
        })

      expect((await create(1)).statusCode).toBe(201)
      expect((await create(6)).statusCode).toBe(201)
      for (const invalid of [0, 7, 2.5, '4', null, -1]) {
        expect((await create(invalid)).statusCode).toBe(400)
      }

      await app.close()
    })

    it('refuses a duplicated name in the same company, case insensitive', async () => {
      seedRooms(room())
      const app = await rooms()

      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/rooms',
        headers: authHeaders(companyAdminUser),
        payload: { name: 'salle néon' },
      })

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'room_name_already_exists' })

      await app.close()
    })

    it('allows reusing the name of a deleted room', async () => {
      seedRooms(room({ status: ROOM_STATUS_DELETED, deleted_at: MOCK_NOW }))
      const app = await rooms()

      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/rooms',
        headers: authHeaders(companyAdminUser),
        payload: { name: 'Salle Néon' },
      })

      expect(response.statusCode).toBe(201)

      await app.close()
    })

    it('rejects invalid bodies, other companies and deleted companies', async () => {
      const app = await rooms()

      const emptyName = await app.inject({
        method: 'POST',
        url: '/companies/1/rooms',
        headers: authHeaders(companyAdminUser),
        payload: { name: '   ' },
      })
      const tooLargeConfig = await app.inject({
        method: 'POST',
        url: '/companies/1/rooms',
        headers: authHeaders(companyAdminUser),
        payload: { name: 'Salle', config: { blob: 'x'.repeat(20_001) } },
      })
      const otherCompany = await app.inject({
        method: 'POST',
        url: '/companies/2/rooms',
        headers: authHeaders(companyAdminUser),
        payload: { name: 'Salle' },
      })

      dbState.companies[0]!.status = COMPANY_STATUS_DELETED
      const deletedCompany = await app.inject({
        method: 'POST',
        url: '/companies/1/rooms',
        headers: authHeaders(superadminUser),
        payload: { name: 'Salle' },
      })

      expect(emptyName.statusCode).toBe(400)
      expect(tooLargeConfig.statusCode).toBe(400)
      expect(otherCompany.statusCode).toBe(403)
      expect(deletedCompany.statusCode).toBe(409)
      expect(parseJson(deletedCompany)).toEqual({ error: 'company_deleted' })

      await app.close()
    })
  })

  describe('rooms of a deleted company', () => {
    it('refuses to edit, reactivate or restore them, but still allows deleting', async () => {
      seedRooms(room(), room({ id: 2, name: 'Salle Laser', status: ROOM_STATUS_DELETED }))
      dbState.companies[0]!.status = COMPANY_STATUS_DELETED
      const app = await rooms()

      const rename = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/1',
        headers: authHeaders(superadminUser),
        payload: { name: 'Nouveau nom' },
      })
      const deactivate = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/1/status',
        headers: authHeaders(superadminUser),
        payload: { status: ROOM_STATUS_INACTIVE },
      })
      const restore = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/2/status',
        headers: authHeaders(superadminUser),
        payload: { status: ROOM_STATUS_ACTIVE },
      })
      const remove = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/1/status',
        headers: authHeaders(superadminUser),
        payload: { status: ROOM_STATUS_DELETED },
      })

      for (const response of [rename, deactivate, restore]) {
        expect(response.statusCode).toBe(409)
        expect(parseJson(response)).toEqual({ error: 'company_deleted' })
      }
      expect(remove.statusCode).toBe(200)
      expect(dbState.rooms[0]).toMatchObject({ status: ROOM_STATUS_DELETED, deleted_at: MOCK_NOW })

      await app.close()
    })
  })

  describe('GET /companies/:companyId/rooms/:roomId', () => {
    it('returns the room, hides deleted rooms from non superadmins', async () => {
      seedRooms(room(), room({ id: 2, name: 'Rétro', status: ROOM_STATUS_DELETED }))
      const app = await rooms()

      const found = await app.inject({
        method: 'GET',
        url: '/companies/1/rooms/1',
        headers: authHeaders(companyAdminUser),
      })
      const deleted = await app.inject({
        method: 'GET',
        url: '/companies/1/rooms/2',
        headers: authHeaders(companyAdminUser),
      })
      const deletedAsSuperadmin = await app.inject({
        method: 'GET',
        url: '/companies/1/rooms/2',
        headers: authHeaders(superadminUser),
      })
      const wrongCompany = await app.inject({
        method: 'GET',
        url: '/companies/2/rooms/1',
        headers: authHeaders(superadminUser),
      })

      expect(parseJson(found).room).toMatchObject({ id: 1, name: 'Salle Néon' })
      expect(deleted.statusCode).toBe(404)
      expect(deletedAsSuperadmin.statusCode).toBe(200)
      expect(wrongCompany.statusCode).toBe(404)

      await app.close()
    })
  })

  describe('PATCH /companies/:companyId/rooms/:roomId', () => {
    it('updates the name and the config', async () => {
      seedRooms(room())
      const app = await rooms()

      const response = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/1',
        headers: authHeaders(companyAdminUser),
        payload: { name: 'Salle Laser', config: { lights: [] } },
      })

      expect(response.statusCode).toBe(200)
      expect(parseJson(response).room).toMatchObject({
        name: 'Salle Laser',
        config: { lights: [] },
        updatedAt: MOCK_NOW,
      })

      await app.close()
    })

    it('rejects an empty body, a duplicated name and deleted rooms', async () => {
      seedRooms(
        room(),
        room({ id: 2, name: 'Salle Laser' }),
        room({ id: 3, name: 'Rétro', status: ROOM_STATUS_DELETED })
      )
      const app = await rooms()

      const empty = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/1',
        headers: authHeaders(companyAdminUser),
        payload: {},
      })
      const duplicated = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/1',
        headers: authHeaders(companyAdminUser),
        payload: { name: 'SALLE LASER' },
      })
      const sameName = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/1',
        headers: authHeaders(companyAdminUser),
        payload: { name: 'Salle Néon' },
      })
      const deleted = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/3',
        headers: authHeaders(companyAdminUser),
        payload: { name: 'Neuf' },
      })

      expect(empty.statusCode).toBe(400)
      expect(duplicated.statusCode).toBe(409)
      expect(sameName.statusCode).toBe(200)
      expect(deleted.statusCode).toBe(404)

      await app.close()
    })
  })

  describe('DELETE /companies/:companyId/rooms/:roomId', () => {
    it('soft deletes the room', async () => {
      seedRooms(room())
      const app = await rooms()

      const response = await app.inject({
        method: 'DELETE',
        url: '/companies/1/rooms/1',
        headers: authHeaders(companyAdminUser),
      })
      const again = await app.inject({
        method: 'DELETE',
        url: '/companies/1/rooms/1',
        headers: authHeaders(companyAdminUser),
      })

      expect(response.statusCode).toBe(200)
      expect(dbState.rooms[0]).toMatchObject({ status: ROOM_STATUS_DELETED, deleted_at: MOCK_NOW })
      expect(again.statusCode).toBe(404)

      await app.close()
    })
  })

  describe('PATCH /companies/:companyId/rooms/:roomId/status', () => {
    it('deactivates, deletes and restores a room', async () => {
      seedRooms(room())
      const app = await rooms()

      const inactive = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/1/status',
        headers: authHeaders(companyAdminUser),
        payload: { status: ROOM_STATUS_INACTIVE },
      })
      const deleted = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/1/status',
        headers: authHeaders(companyAdminUser),
        payload: { status: ROOM_STATUS_DELETED },
      })

      expect(parseJson(inactive).room).toMatchObject({
        status: ROOM_STATUS_INACTIVE,
        deletedAt: null,
      })
      expect(parseJson(deleted).room).toMatchObject({
        status: ROOM_STATUS_DELETED,
        deletedAt: MOCK_NOW,
      })

      const restored = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/1/status',
        headers: authHeaders(companyAdminUser),
        payload: { status: ROOM_STATUS_ACTIVE },
      })

      expect(parseJson(restored).room).toMatchObject({
        status: ROOM_STATUS_ACTIVE,
        deletedAt: null,
      })

      await app.close()
    })

    it('refuses to restore a room whose name was reused, and invalid statuses', async () => {
      seedRooms(room({ status: ROOM_STATUS_DELETED, deleted_at: MOCK_NOW }), room({ id: 2 }))
      const app = await rooms()

      const restored = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/1/status',
        headers: authHeaders(companyAdminUser),
        payload: { status: ROOM_STATUS_ACTIVE },
      })
      const invalid = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/2/status',
        headers: authHeaders(companyAdminUser),
        payload: { status: 3 },
      })
      const unknown = await app.inject({
        method: 'PATCH',
        url: '/companies/1/rooms/9/status',
        headers: authHeaders(companyAdminUser),
        payload: { status: ROOM_STATUS_INACTIVE },
      })

      expect(restored.statusCode).toBe(409)
      expect(invalid.statusCode).toBe(400)
      expect(unknown.statusCode).toBe(404)

      await app.close()
    })
  })
})
