import type { RoomLog, RoomLogLevel, RoomStatus as SharedRoomStatus } from '@quizzup/shared'

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

/** US-ROOM-02 : compte de connexion du PC de la salle (rôle `room`). */
export type RoomAccount = {
  id: number
  username: string
  status: number
  createdAt: string
}

export type RoomAccountResponse = {
  account: RoomAccount | null
}

export type CreateRoomAccountResponse = {
  account: RoomAccount
}

export type DeleteRoomAccountResponse = {
  ok: true
}

export type CreateRoomAccountPayload = {
  username: string
  password: string
}

export type RoomAccountFormValues = {
  username: string
  password: string
  passwordConfirm: string
}

export type RoomAccountFieldErrors = {
  username?: string
  password?: string
  passwordConfirm?: string
}

/** US-LOG-01 : journaux d'erreurs remontés par l'écran de salle, du plus récent au plus ancien. */
export type RoomLogsResponse = {
  logs: RoomLog[]
}

/** `before` : id de la dernière entrée déjà reçue (pagination par curseur). */
export type RoomLogsQuery = {
  level?: RoomLogLevel
  before?: number
}
