import { getRoomDesksCount, ROOM_STATUS_ACTIVE, type RoomSchedule } from '@quizzup/shared'
import type { Knex } from 'knex'

import db from '../../db'

/** Salle ouverte à la réservation : active, avec des créneaux réglés et `publicBooking` vrai. */
export type BookableRoom = {
  id: number
  name: string
  config: unknown
  schedule: RoomSchedule
}

/**
 * Salles réservables de la compagnie, par id. Une salle d'une autre compagnie, inactive, supprimée,
 * sans créneaux ou fermée à la réservation n'y figure pas : l'appelant ne peut pas les distinguer.
 * Avec `roomId`, au plus une salle.
 * Dans une transaction, passer `conn` (la transaction) : une lecture par `db` prendrait une seconde
 * connexion du pool, et des appels simultanés se bloqueraient les uns les autres.
 */
export async function findBookableRooms(
  companyId: number,
  roomId?: number,
  conn: Knex | Knex.Transaction = db
): Promise<BookableRoom[]> {
  const query = conn('rooms')
    .where('company_id', companyId)
    .where('status', ROOM_STATUS_ACTIVE)
    .whereNotNull('schedule')

  if (roomId !== undefined) query.where('id', roomId)

  const rooms = (await query.orderBy('id').select('id', 'name', 'config', 'schedule')) as Array<
    Omit<BookableRoom, 'schedule'> & { schedule: RoomSchedule }
  >

  // `publicBooking` est lu ici et non en SQL : quelques salles par compagnie, jsonb non indexé.
  return rooms
    .filter((room) => room.schedule.publicBooking === true)
    .map((room) => ({ ...room, id: Number(room.id) }))
}

/** Une salle telle que l'API la décrit (`PublicRoom` de `public-v1.yaml`). */
export function toPublicRoom(room: BookableRoom) {
  const { schedule } = room
  // Jamais plus de pupitres que la salle n'en a, quoi que dise le réglage.
  const bookableDesks = Math.min(schedule.bookableDesks, getRoomDesksCount(room.config))

  return {
    id: room.id,
    name: room.name,
    timezone: schedule.timezone,
    slotMinutes: schedule.slotMinutes,
    breakMinutes: schedule.breakMinutes,
    bookableDesks,
    // Deux joueurs par pupitre (`GAME_MAX_PLAYERS` = `GAME_PODIUMS` × 2).
    maxPlayers: bookableDesks * 2,
    days: schedule.days,
  }
}
