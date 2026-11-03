import type { RoomStatus as SharedRoomStatus } from '@quizzup/shared'

export type RoomStatus = SharedRoomStatus

export type RoomStatusFilter = RoomStatus | 'all'

/** Configuration matérielle d'une salle (buzzers, lumières…), libre côté API. */
export type RoomConfig = Record<string, unknown>

export type Room = {
  id: number
  companyId: number
  name: string
  config: RoomConfig
  status: RoomStatus
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
}

export type RoomTableRow = Room & {
  hasConfig: boolean
}

export type LoadCompanyRoomsResponse = {
  rooms: Room[]
}

export type RoomResponse = {
  room: Room
}

export type RoomStatusUpdatePayload = {
  status: RoomStatus
}

export type CreateRoomPayload = {
  name: string
}

export type UpdateRoomPayload = {
  name: string
}

export type RoomFormValues = {
  name: string
}

export type RoomFieldErrors = {
  name?: string
}

export type RoomFormMode = 'create' | 'edit'
