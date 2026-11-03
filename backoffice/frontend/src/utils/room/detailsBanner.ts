import type { ActionBanner } from '@/types/banner'
import type { Room, RoomFormMode } from '@/types/room'
import { createSuccessBanner } from '@/utils/banner'
import { findRoomById, getRoomDisplayName } from '@/utils/room/list'
import { getRoomUpdateSuccessCode, toRoomStatus } from '@/utils/room/status'

export function createRoomUpdatedBanner(rooms: Room[], updatedRoom: Room): ActionBanner {
  const currentRoom = findRoomById(rooms, updatedRoom.id)
  const updatedStatus = toRoomStatus(updatedRoom.status)

  return createSuccessBanner(getRoomUpdateSuccessCode(updatedStatus), {
    name: getRoomDisplayName(updatedRoom, currentRoom),
  })
}

export function createRoomDeletedBanner(rooms: Room[], roomId: number): ActionBanner {
  const deletedRoom = findRoomById(rooms, roomId)

  return createSuccessBanner('roomDeleted', {
    name: deletedRoom ? getRoomDisplayName(deletedRoom) : `#${roomId}`,
  })
}

export function createRoomSavedBanner(room: Room, mode: RoomFormMode): ActionBanner {
  return createSuccessBanner(mode === 'create' ? 'roomCreated' : 'roomRenamed', {
    name: getRoomDisplayName(room),
  })
}
