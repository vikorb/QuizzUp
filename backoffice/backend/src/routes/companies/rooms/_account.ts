import { randomUUID } from 'node:crypto'

import {
  ADMIN_ROLE_ROOM,
  ADMIN_STATUS_DELETED,
  GAME_STATE_ABORTED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
} from '@quizzup/shared'

import db from '../../../db'

export type RoomAccountRow = {
  id: number
  companyId: number
  roomId: number
  username: string
  status: number
  createdAt: string
  updatedAt: string | null
}

export const roomAccountSelect = [
  'id',
  'company_id as companyId',
  'room_id as roomId',
  'username',
  'status',
  'created_at as createdAt',
  'updated_at as updatedAt',
]

/**
 * Un compte de salle n'a pas de boîte mail : on lui donne une adresse unique
 * sur le domaine réservé `.invalid` pour respecter la contrainte `admins.email`.
 */
export function buildRoomAccountEmail(): string {
  return `room-${randomUUID()}@rooms.quizzup.invalid`
}

export async function findRoomAccount(roomId: number): Promise<RoomAccountRow | undefined> {
  const account = await db('admins')
    .where('room_id', roomId)
    .where('role', ADMIN_ROLE_ROOM)
    .whereNot('status', ADMIN_STATUS_DELETED)
    .first(roomAccountSelect)

  return account as RoomAccountRow | undefined
}

/**
 * Supprime (logiquement) le compte de la salle et révoque ses sessions : le PC
 * de la salle perd l'accès immédiatement. Renvoie l'id du compte supprimé.
 */
export async function deleteRoomAccount(roomId: number): Promise<number | null> {
  const account = await findRoomAccount(roomId)

  if (!account) {
    return null
  }

  await db('admins').where('id', account.id).update({
    status: ADMIN_STATUS_DELETED,
    updated_at: db.fn.now(),
    deleted_at: db.fn.now(),
  })
  await db('admin_sessions')
    .where('admin_id', account.id)
    .whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() })

  return Number(account.id)
}

/** Arrête les parties en attente ou en cours d'une salle (salle supprimée). */
export async function abortRoomActiveGames(roomId: number): Promise<number> {
  return db('games')
    .where('room_id', roomId)
    .whereIn('state', [GAME_STATE_PENDING, GAME_STATE_RUNNING])
    .update({
      state: GAME_STATE_ABORTED,
      finished_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
}
