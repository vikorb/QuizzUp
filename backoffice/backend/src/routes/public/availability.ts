import {
  computeRoomSlots,
  GAME_SLOT_STATES,
  GAME_STATUS_DELETED,
  SESSION_HORIZON_DAYS,
} from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import db from '../../db'
import { findBookableRooms } from './_rooms'
import { sendPublicError } from './_shared'

const DAY_MS = 86_400_000

/** Un jour du calendrier qui existe : `2027-02-30` est refusé. */
function isCalendarDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00Z`)

  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
}

const availabilityQuerySchema = z.object({
  room: z.coerce.number().int().positive(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isCalendarDate),
})

/** Date du jour dans le fuseau de la salle (`YYYY-MM-DD`). */
function localToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * `GET /public/v1/availability?room=&date=` : créneaux libres d'une salle un jour local donné.
 * Même calcul que l'agenda du backoffice (`computeRoomSlots`), avec les sessions déjà prises.
 */
const publicAvailabilityRoutes: FastifyPluginAsync = async (app) => {
  app.get('/availability', async (req, reply) => {
    const query = availabilityQuerySchema.safeParse(req.query)

    if (!query.success) return sendPublicError(reply, 400, 'invalid_query')

    const { room: roomId, date } = query.data
    const [room] = await findBookableRooms(req.apiKey!.companyId, roomId)

    // Même 404 pour une salle étrangère, inactive ou fermée à la réservation.
    if (!room) return sendPublicError(reply, 404, 'room_not_found')

    const { timezone } = room.schedule
    const now = new Date()
    const daysFromToday = Math.round(
      (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${localToday(now, timezone)}T00:00:00Z`)) /
        DAY_MS
    )

    if (daysFromToday < -1 || daysFromToday > SESSION_HORIZON_DAYS) {
      return sendPublicError(reply, 422, 'date_out_of_range')
    }

    // Fenêtre large autour de ce jour lu comme UTC (les fuseaux vont de -12 h à +14 h, et une
    // ouverture dure jusqu'à 24 h) : `computeRoomSlots` écarte ce qui ne chevauche aucun créneau.
    const dayStart = Date.parse(`${date}T00:00:00Z`)
    const busy = await db('games')
      .where('room_id', room.id)
      .where('company_id', req.apiKey!.companyId)
      .whereNot('status', GAME_STATUS_DELETED)
      .whereIn('state', GAME_SLOT_STATES)
      .whereNotNull('scheduled_at')
      .where('scheduled_at', '<', new Date(dayStart + 3 * DAY_MS))
      .where('scheduled_end_at', '>', new Date(dayStart - DAY_MS))
      .select('scheduled_at', 'scheduled_end_at')

    const slots = computeRoomSlots({
      schedule: room.schedule,
      date,
      now,
      busy: busy.map((game) => ({ startsAt: game.scheduled_at, endsAt: game.scheduled_end_at })),
    })

    return { roomId: room.id, date, timezone, slots }
  })
}

export default publicAvailabilityRoutes
