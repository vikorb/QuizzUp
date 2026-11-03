import { ROOM_STATUS_ACTIVE, ROOM_STATUS_DELETED, ROOM_STATUS_INACTIVE } from '@quizzup/shared'

import type { TranslateFn } from '@/types'
import type { SelectFieldOption } from '@/types/form'
import type { Room, RoomStatusFilter } from '@/types/room'
import { filterByQuery } from '@/utils/filter'

export const DEFAULT_ROOM_STATUS_FILTER: RoomStatusFilter = ROOM_STATUS_ACTIVE

export function getRoomStatusFilterOptions(
  t: TranslateFn,
  includeDeleted = false
): SelectFieldOption[] {
  const options: SelectFieldOption[] = [
    {
      value: String(ROOM_STATUS_ACTIVE),
      label: t('rooms.filters.status.active'),
    },
    {
      value: String(ROOM_STATUS_INACTIVE),
      label: t('rooms.filters.status.inactive'),
    },
  ]

  if (includeDeleted) {
    options.push({
      value: String(ROOM_STATUS_DELETED),
      label: t('rooms.filters.status.deleted'),
    })
  }

  options.push({
    value: 'all',
    label: t('rooms.filters.status.all'),
  })

  return options
}

export function parseRoomStatusFilter(
  value: string,
  fallback: RoomStatusFilter,
  includeDeleted = false
): RoomStatusFilter {
  if (value === 'all') {
    return 'all'
  }

  const numericValue = Number(value)

  if (numericValue === ROOM_STATUS_ACTIVE || numericValue === ROOM_STATUS_INACTIVE) {
    return numericValue
  }

  if (includeDeleted && numericValue === ROOM_STATUS_DELETED) {
    return numericValue
  }

  return fallback
}

export function hasRoomToolbarActiveFilters(
  searchQuery: string,
  statusFilter: RoomStatusFilter
): boolean {
  return searchQuery.trim().length > 0 || statusFilter !== DEFAULT_ROOM_STATUS_FILTER
}

export function filterRooms(rooms: Room[], searchQuery: string): Room[] {
  return filterByQuery(rooms, searchQuery, (room) => [room.name])
}

export function filterRoomsByStatus(rooms: Room[], statusFilter: RoomStatusFilter): Room[] {
  if (statusFilter === 'all') {
    return rooms
  }

  return rooms.filter((room) => room.status === statusFilter)
}

/** Défense en profondeur : hors superadmin, une salle supprimée n'est jamais listée. */
export function filterVisibleRooms(rooms: Room[], canSeeDeleted: boolean): Room[] {
  if (canSeeDeleted) {
    return rooms
  }

  return rooms.filter((room) => room.status !== ROOM_STATUS_DELETED)
}
