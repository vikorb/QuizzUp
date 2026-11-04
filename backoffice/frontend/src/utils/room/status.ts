import { ROOM_STATUS_ACTIVE, ROOM_STATUS_DELETED, ROOM_STATUS_INACTIVE } from '@quizzup/shared'

import type { RoomStatus } from '@/types/room'

export function toRoomStatus(value: unknown): RoomStatus {
  if (value === ROOM_STATUS_INACTIVE) {
    return ROOM_STATUS_INACTIVE
  }

  if (value === ROOM_STATUS_DELETED) {
    return ROOM_STATUS_DELETED
  }

  return ROOM_STATUS_ACTIVE
}

export function isRoomActive(status: RoomStatus): boolean {
  return status === ROOM_STATUS_ACTIVE
}

export function isRoomDeleted(status: RoomStatus): boolean {
  return status === ROOM_STATUS_DELETED
}

export function getRoomUpdateSuccessCode(status: RoomStatus): string {
  if (status === ROOM_STATUS_ACTIVE) {
    return 'roomActivated'
  }

  if (status === ROOM_STATUS_INACTIVE) {
    return 'roomDisabled'
  }

  return 'roomDeleted'
}
