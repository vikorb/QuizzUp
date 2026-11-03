import { ROOM_STATUS_DELETED } from '@quizzup/shared'

import db from '../../../db'
import type { RoomRow } from '../../../types/room'

export const roomSelect = [
  'id',
  'company_id as companyId',
  'name',
  'config',
  'status',
  'created_at as createdAt',
  'updated_at as updatedAt',
  'deleted_at as deletedAt',
]

export async function findRoomInCompany(
  companyId: number,
  roomId: number
): Promise<RoomRow | undefined> {
  const room = await db('rooms')
    .where('company_id', companyId)
    .where('id', roomId)
    .first(roomSelect)

  return room as RoomRow | undefined
}

/** Le nom d'une salle est unique dans sa compagnie, hors salles supprimées. */
export async function isRoomNameTaken(
  companyId: number,
  name: string,
  excludedRoomId?: number
): Promise<boolean> {
  const query = db('rooms')
    .where('company_id', companyId)
    .whereNot('status', ROOM_STATUS_DELETED)
    .whereRaw('LOWER(name) = ?', [name.toLowerCase()])

  if (excludedRoomId !== undefined) {
    query.whereNot('id', excludedRoomId)
  }

  const existing = await query.first('id')

  return Boolean(existing)
}
