import type { Room, RoomConfig, RoomTableRow } from '@/types/room'

export function findRoomById(rooms: Room[], roomId: number): Room | undefined {
  return rooms.find((room) => room.id === roomId)
}

export function updateRoomInList(rooms: Room[], updatedRoom: Room): Room[] {
  return rooms.map((room) => (room.id === updatedRoom.id ? updatedRoom : room))
}

export function addRoomToList(rooms: Room[], createdRoom: Room): Room[] {
  if (findRoomById(rooms, createdRoom.id)) {
    return updateRoomInList(rooms, createdRoom)
  }

  return [...rooms, createdRoom]
}

export function removeRoomFromList(rooms: Room[], roomId: number): Room[] {
  return rooms.filter((room) => room.id !== roomId)
}

export function getRoomDisplayName(room: Room, fallbackRoom?: Room | null): string {
  return room.name.trim() || fallbackRoom?.name.trim() || `#${room.id}`
}

/** Une configuration matérielle est « renseignée » dès qu'elle contient au moins une clé. */
export function hasRoomConfig(config: RoomConfig | null | undefined): boolean {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return false
  }

  return Object.keys(config).length > 0
}

export function toRoomTableRow(room: Room): RoomTableRow {
  return {
    ...room,
    hasConfig: hasRoomConfig(room.config),
  }
}
