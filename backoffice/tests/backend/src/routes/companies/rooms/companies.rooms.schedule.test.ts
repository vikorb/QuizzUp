import '../../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  COMPANY_STATUS_DELETED,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
  type RoomSchedule,
} from '@quizzup/shared'
import companyRoomsRoutes from '@backend/routes/companies/rooms'
import companyRoomIdRoutes from '@backend/routes/companies/rooms/id'
import companyRoomIdScheduleRoutes from '@backend/routes/companies/rooms/idSchedule'
import { API_ACTION, API_RESOURCE } from '@backend/security/permissions'
import { db, dbState, MOCK_NOW, resetDb } from '../../_helpers/mockDb'
import { requireApiPermissionMock, securityState } from '../../_helpers/mockSecurity'
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

const SCHEDULE: RoomSchedule = {
  timezone: 'Europe/Paris',
  slotMinutes: 60,
  breakMinutes: 15,
  bookableDesks: 4,
  publicBooking: true,
  days: {
    '1': { opensAt: '10:00', closesAt: '22:00' },
    '6': { opensAt: '10:00', firstSessionAt: '10:30', closesAt: '01:00' },
  },
}

/** Le `mockDb` n'applique pas les défauts de la base : `schedule` est posé explicitement. */
function room(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    config: {},
    config_revision: 0,
    schedule: null,
    status: ROOM_STATUS_ACTIVE,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

type RoomBody = { room: Record<string, unknown> }
type ErrorBody = { error: string; details?: unknown }

async function scheduleApp() {
  return createRouteApp(async (instance: never) => {
    const fastify = instance as { register: (plugin: unknown) => Promise<void> }
    await fastify.register(companyRoomsRoutes)
    await fastify.register(companyRoomIdRoutes)
    await fastify.register(companyRoomIdScheduleRoutes)
  })
}

type App = Awaited<ReturnType<typeof scheduleApp>>

function putSchedule(
  app: App,
  payload: unknown,
  { url = '/companies/1/rooms/1/schedule', user = companyAdminUser } = {}
) {
  return app.inject({ method: 'PUT', url, headers: authHeaders(user), payload: payload as never })
}

function withDays(days: unknown) {
  return { schedule: { ...SCHEDULE, days } }
}

describe('PUT /companies/:companyId/rooms/:roomId/schedule', () => {
  it('stores the schedule and returns the room, for an admin and for the superadmin', async () => {
    resetDb({ rooms: [room()] })
    const app = await scheduleApp()

    const asAdmin = await putSchedule(app, { schedule: SCHEDULE })

    expect(asAdmin.statusCode).toBe(200)
    expect(parseJson<RoomBody>(asAdmin).room).toMatchObject({
      id: 1,
      schedule: SCHEDULE,
      updatedAt: MOCK_NOW,
    })
    expect(dbState.rooms[0]!.schedule).toEqual(SCHEDULE)

    const asSuperadmin = await putSchedule(
      app,
      { schedule: { ...SCHEDULE, slotMinutes: 90 } },
      { user: superadminUser }
    )

    expect(asSuperadmin.statusCode).toBe(200)
    expect(dbState.rooms[0]!.schedule).toMatchObject({ slotMinutes: 90 })

    await app.close()
  })

  it('does not touch the hardware config of the room', async () => {
    resetDb({ rooms: [room({ config: { desksCount: 6 }, config_revision: 3 })] })
    const app = await scheduleApp()

    await putSchedule(app, { schedule: SCHEDULE })

    expect(dbState.rooms[0]).toMatchObject({ config: { desksCount: 6 }, config_revision: 3 })

    await app.close()
  })

  it('defaults the break to 0 and drops unknown fields', async () => {
    resetDb({ rooms: [room()] })
    const app = await scheduleApp()
    const { breakMinutes: _break, ...withoutBreak } = SCHEDULE

    const response = await putSchedule(app, { schedule: { ...withoutBreak, extra: true } })

    expect(response.statusCode).toBe(200)
    expect(dbState.rooms[0]!.schedule).toEqual({ ...SCHEDULE, breakMinutes: 0 })

    await app.close()
  })

  it('resets the schedule with null: the room is no longer bookable', async () => {
    resetDb({ rooms: [room({ schedule: SCHEDULE })] })
    const app = await scheduleApp()

    const response = await putSchedule(app, { schedule: null })

    expect(response.statusCode).toBe(200)
    expect(parseJson<RoomBody>(response).room.schedule).toBeNull()
    expect(dbState.rooms[0]!.schedule).toBeNull()

    await app.close()
  })

  it('accepts a schedule without any open day', async () => {
    resetDb({ rooms: [room()] })
    const app = await scheduleApp()

    const response = await putSchedule(app, withDays({}))

    expect(response.statusCode).toBe(200)
    expect(dbState.rooms[0]!.schedule).toMatchObject({ days: {} })

    await app.close()
  })

  it('is read back by GET /rooms and GET /rooms/:id', async () => {
    resetDb({ rooms: [room({ schedule: SCHEDULE }), room({ id: 2, name: 'Rétro' })] })
    const app = await scheduleApp()

    const list = await app.inject({
      method: 'GET',
      url: '/companies/1/rooms',
      headers: authHeaders(companyAdminUser),
    })
    const one = await app.inject({
      method: 'GET',
      url: '/companies/1/rooms/1',
      headers: authHeaders(companyAdminUser),
    })

    const { rooms } = parseJson<{ rooms: Array<Record<string, unknown>> }>(list)

    expect(rooms.map((item) => item.schedule)).toEqual([SCHEDULE, null])
    expect(parseJson<RoomBody>(one).room.schedule).toEqual(SCHEDULE)

    await app.close()
  })

  describe('access', () => {
    it('requires authentication', async () => {
      resetDb({ rooms: [room()] })
      const app = await scheduleApp()

      const response = await app.inject({
        method: 'PUT',
        url: '/companies/1/rooms/1/schedule',
        payload: { schedule: SCHEDULE },
      })

      expect(response.statusCode).toBe(401)
      expect(dbState.rooms[0]!.schedule).toBeNull()

      await app.close()
    })

    it('forbids the user role: no room:update permission', async () => {
      resetDb({ rooms: [room()] })
      const app = await scheduleApp()
      securityState.hasPermission = false

      const response = await putSchedule(
        app,
        { schedule: SCHEDULE },
        { user: { ...companyUser, company_id: 1, companyId: 1 } }
      )

      expect(response.statusCode).toBe(403)
      expect(requireApiPermissionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        API_RESOURCE.ROOM,
        API_ACTION.UPDATE
      )
      expect(dbState.rooms[0]!.schedule).toBeNull()

      await app.close()
    })

    it('forbids an admin of company A on a room of company B', async () => {
      resetDb({ rooms: [room({ id: 5, company_id: 2 })] })
      const app = await scheduleApp()

      const response = await putSchedule(
        app,
        { schedule: SCHEDULE },
        { url: '/companies/2/rooms/5/schedule' }
      )

      expect(response.statusCode).toBe(403)
      expect(parseJson<ErrorBody>(response).error).toBe('forbidden')
      expect(dbState.rooms[0]!.schedule).toBeNull()

      await app.close()
    })

    it('does not reach a room of company B through the URL of company A', async () => {
      resetDb({ rooms: [room({ id: 5, company_id: 2 })] })
      const app = await scheduleApp()

      const response = await putSchedule(
        app,
        { schedule: SCHEDULE },
        { url: '/companies/1/rooms/5/schedule' }
      )

      expect(response.statusCode).toBe(404)
      expect(dbState.rooms[0]!.schedule).toBeNull()

      await app.close()
    })
  })

  describe('rejections', () => {
    it('answers 404 for an unknown or deleted room and 400 for invalid params', async () => {
      resetDb({ rooms: [room({ id: 2, status: ROOM_STATUS_DELETED })] })
      const app = await scheduleApp()
      const body = { schedule: SCHEDULE }

      const unknown = await putSchedule(app, body, { url: '/companies/1/rooms/9/schedule' })
      const deleted = await putSchedule(app, body, { url: '/companies/1/rooms/2/schedule' })
      const invalid = await putSchedule(app, body, { url: '/companies/1/rooms/abc/schedule' })

      expect(unknown.statusCode).toBe(404)
      expect(parseJson<ErrorBody>(unknown).error).toBe('not_found')
      expect(deleted.statusCode).toBe(404)
      expect(invalid.statusCode).toBe(400)
      expect(parseJson<ErrorBody>(invalid).error).toBe('invalid_params')

      await app.close()
    })

    it('answers 404 and writes nothing when the room is deleted between the read and the write', async () => {
      resetDb({ rooms: [room()] })
      const app = await scheduleApp()
      // `db.fn.now()` est appelé en construisant l'UPDATE, après la lecture de la salle.
      db.fn.now.mockImplementationOnce(() => {
        dbState.rooms[0]!.status = ROOM_STATUS_DELETED

        return MOCK_NOW
      })

      const response = await putSchedule(app, { schedule: SCHEDULE })

      expect(response.statusCode).toBe(404)
      expect(parseJson<ErrorBody>(response).error).toBe('not_found')
      expect(dbState.rooms[0]!.schedule).toBeNull()

      await app.close()
    })

    it('answers 409 company_deleted for a room of a deleted company', async () => {
      resetDb({ rooms: [room()] })
      dbState.companies[0]!.status = COMPANY_STATUS_DELETED
      const app = await scheduleApp()

      const response = await putSchedule(app, { schedule: SCHEDULE }, { user: superadminUser })

      expect(response.statusCode).toBe(409)
      expect(parseJson<ErrorBody>(response)).toEqual({ error: 'company_deleted' })
      expect(dbState.rooms[0]!.schedule).toBeNull()

      await app.close()
    })

    const open = { opensAt: '10:00', closesAt: '22:00' }
    const invalidBodies: Array<[string, unknown, string?]> = [
      [
        'an unknown time zone',
        { schedule: { ...SCHEDULE, timezone: 'Mars/Olympus' } },
        'schedule_timezone_invalid',
      ],
      [
        'an empty time zone',
        { schedule: { ...SCHEDULE, timezone: '' } },
        'schedule_timezone_invalid',
      ],
      [
        'a fixed offset as time zone',
        { schedule: { ...SCHEDULE, timezone: '+01:00' } },
        'schedule_timezone_invalid',
      ],
      [
        'a time zone abbreviation',
        { schedule: { ...SCHEDULE, timezone: 'EST' } },
        'schedule_timezone_invalid',
      ],
      ['a missing schedule key', {}],
      ['an undefined schedule', { schedule: undefined }],
      ['a slot shorter than the minimum', { schedule: { ...SCHEDULE, slotMinutes: 9 } }],
      ['a slot longer than the maximum', { schedule: { ...SCHEDULE, slotMinutes: 241 } }],
      ['a decimal slot', { schedule: { ...SCHEDULE, slotMinutes: 60.5 } }],
      ['a negative break', { schedule: { ...SCHEDULE, breakMinutes: -1 } }],
      ['a break longer than the maximum', { schedule: { ...SCHEDULE, breakMinutes: 121 } }],
      ['no bookable desk', { schedule: { ...SCHEDULE, bookableDesks: 0 } }],
      ['more bookable desks than podiums', { schedule: { ...SCHEDULE, bookableDesks: 7 } }],
      ['a non boolean publicBooking', { schedule: { ...SCHEDULE, publicBooking: 'yes' } }],
      ['a day outside 1 to 7', withDays({ '8': open })],
      [
        'a time that is not HH:MM',
        withDays({ '1': { opensAt: '24:00', closesAt: '22:00' } }),
        'schedule_time_invalid',
      ],
      // Zod 4 enchaîne les `refine` malgré l'échec du `regex` : jamais de 500 sur ces cas.
      [
        'a malformed first session time',
        withDays({ '1': { ...open, firstSessionAt: '9:00' } }),
        'schedule_time_invalid',
      ],
      [
        'an opening time out of range next to a first session',
        withDays({ '1': { opensAt: '24:00', closesAt: '22:00', firstSessionAt: '10:00' } }),
        'schedule_time_invalid',
      ],
      [
        'a malformed closing time followed by another day',
        withDays({ '1': { opensAt: '10:00', closesAt: '2:00' }, '2': open }),
        'schedule_time_invalid',
      ],
      ['a day without closing time', withDays({ '1': { opensAt: '10:00' } })],
      [
        'a first session before the opening that is not after midnight',
        withDays({ '1': { ...open, firstSessionAt: '09:00' } }),
        'schedule_first_session_out_of_range',
      ],
      [
        'a first session at the closing time',
        withDays({ '1': { ...open, firstSessionAt: '22:00' } }),
        'schedule_first_session_out_of_range',
      ],
      [
        'a closing after midnight beyond the opening of the next day',
        withDays({
          '1': { opensAt: '10:00', closesAt: '02:00' },
          '2': { opensAt: '01:00', closesAt: '22:00' },
        }),
        'schedule_days_overlap',
      ],
      [
        'a Sunday closing that overlaps the opening of Monday',
        withDays({
          '7': { opensAt: '22:00', closesAt: '11:00' },
          '1': { opensAt: '10:00', closesAt: '20:00' },
        }),
        'schedule_days_overlap',
      ],
    ]

    it.each(invalidBodies)('answers 400 invalid_body for %s', async (_label, payload, code) => {
      resetDb({ rooms: [room()] })
      const app = await scheduleApp()

      const response = await putSchedule(app, payload)

      expect(response.statusCode).toBe(400)
      expect(parseJson<ErrorBody>(response).error).toBe('invalid_body')

      if (code) {
        expect(JSON.stringify(parseJson<ErrorBody>(response).details)).toContain(code)
      }

      expect(dbState.rooms[0]!.schedule).toBeNull()

      await app.close()
    })

    it.each([
      ['UTC', 'UTC'],
      ['Europe/Paris', 'Europe/Paris'],
      ['europe/paris', 'Europe/Paris'],
    ])('stores the time zone %s as %s', async (sent, stored) => {
      resetDb({ rooms: [room()] })
      const app = await scheduleApp()

      const response = await putSchedule(app, { schedule: { ...SCHEDULE, timezone: sent } })

      expect(response.statusCode).toBe(200)
      expect(dbState.rooms[0]!.schedule).toMatchObject({ timezone: stored })
      expect(parseJson<RoomBody>(response).room.schedule).toMatchObject({ timezone: stored })

      await app.close()
    })

    it('accepts days that touch, a first session after midnight and 24 h of opening', async () => {
      resetDb({ rooms: [room()] })
      const app = await scheduleApp()
      const days = {
        // Ferme à 02:00, le lendemain ouvre à 02:00 : bout à bout, pas de chevauchement.
        '1': { opensAt: '10:00', closesAt: '02:00' },
        '2': { opensAt: '02:00', closesAt: '22:00' },
        // Première session après minuit, dans la plage 18:00 → 02:00.
        '5': { opensAt: '18:00', firstSessionAt: '01:00', closesAt: '02:00' },
        // Ouvert 24 h (closesAt = opensAt), le lendemain n'est pas ouvert plus tôt.
        '7': { opensAt: '10:00', closesAt: '10:00' },
        '3': open,
      }

      const response = await putSchedule(app, withDays(days))

      expect(response.statusCode).toBe(200)
      expect(dbState.rooms[0]!.schedule).toMatchObject({ days })

      await app.close()
    })
  })
})
