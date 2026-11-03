import type { ActionBanner } from '@/types/banner'
import type { Room, RoomAccount, RoomFormMode } from '@/types/room'
import { createSuccessBanner } from '@/utils/banner'
import { findRoomById, getRoomDisplayName } from '@/utils/room/list'
import { getRoomUpdateSuccessCode, toRoomStatus } from '@/utils/room/status'

function getRoomNameById(rooms: Room[], roomId: number): string {
  const room = findRoomById(rooms, roomId)

  return room ? getRoomDisplayName(room) : `#${roomId}`
}

export function createRoomUpdatedBanner(rooms: Room[], updatedRoom: Room): ActionBanner {
  const currentRoom = findRoomById(rooms, updatedRoom.id)
  const updatedStatus = toRoomStatus(updatedRoom.status)

  return createSuccessBanner(getRoomUpdateSuccessCode(updatedStatus), {
    name: getRoomDisplayName(updatedRoom, currentRoom),
  })
}

export function createRoomDeletedBanner(rooms: Room[], roomId: number): ActionBanner {
  return createSuccessBanner('roomDeleted', {
    name: getRoomNameById(rooms, roomId),
  })
}

/** US-ROOM-02 : création du compte de connexion du PC de la salle. */
export function createRoomAccountCreatedBanner(
  rooms: Room[],
  roomId: number,
  account: RoomAccount
): ActionBanner {
  return createSuccessBanner('roomAccountCreated', {
    username: account.username,
    name: getRoomNameById(rooms, roomId),
  })
}

/** Suppression du compte : ses sessions sont révoquées, le PC de la salle est déconnecté. */
export function createRoomAccountDeletedBanner(
  rooms: Room[],
  roomId: number,
  account: RoomAccount
): ActionBanner {
  return createSuccessBanner('roomAccountDeleted', {
    username: account.username,
    name: getRoomNameById(rooms, roomId),
  })
}

export function createRoomSavedBanner(room: Room, mode: RoomFormMode): ActionBanner {
  return createSuccessBanner(mode === 'create' ? 'roomCreated' : 'roomRenamed', {
    name: getRoomDisplayName(room),
  })
}
