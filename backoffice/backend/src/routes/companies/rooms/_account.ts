import { randomUUID } from 'node:crypto'

import {
  ADMIN_ROLE_ROOM,
  ADMIN_STATUS_DELETED,
  GAME_STATE_ABORTED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  ROOM_STATUS_DELETED,
} from '@quizzup/shared'

import type { Knex } from 'knex'

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

export async function findRoomAccount(
  roomId: number,
  conn: Knex | Knex.Transaction = db
): Promise<RoomAccountRow | undefined> {
  const account = await conn('admins')
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
export async function deleteRoomAccount(
  roomId: number,
  conn: Knex | Knex.Transaction = db
): Promise<number | null> {
  const account = await findRoomAccount(roomId, conn)

  if (!account) {
    return null
  }

  await conn('admins').where('id', account.id).update({
    status: ADMIN_STATUS_DELETED,
    updated_at: db.fn.now(),
    deleted_at: db.fn.now(),
  })
  await conn('admin_sessions')
    .where('admin_id', account.id)
    .whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() })

  return Number(account.id)
}

/** Arrête les parties en attente ou en cours d'une salle (salle supprimée). */
export async function abortRoomActiveGames(
  roomId: number,
  conn: Knex | Knex.Transaction = db
): Promise<number> {
  return conn('games')
    .where('room_id', roomId)
    .whereIn('state', [GAME_STATE_PENDING, GAME_STATE_RUNNING])
    .update({
      state: GAME_STATE_ABORTED,
      finished_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
}

/**
 * Supprime une salle avec son compte et ses parties actives en une seule transaction :
 * une coupure ne doit jamais laisser une salle supprimée dont le PC garde l'accès.
 */
export async function softDeleteRoom(
  roomId: number,
  roomSelectColumns: string[]
): Promise<Record<string, unknown> | undefined> {
  return db.transaction(async (trx) => {
    const updated = await trx('rooms')
      .where('id', roomId)
      .update({ status: ROOM_STATUS_DELETED, updated_at: db.fn.now(), deleted_at: db.fn.now() })
      .returning(roomSelectColumns)

    await deleteRoomAccount(roomId, trx)
    await abortRoomActiveGames(roomId, trx)

    return Array.isArray(updated) ? updated[0] : updated
  })
}
