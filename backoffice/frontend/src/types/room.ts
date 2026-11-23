import type {
  RoomSchedule,
  RoomScheduleDayKey,
  RoomStatus as SharedRoomStatus,
} from '@quizzup/shared'

export type RoomStatus = SharedRoomStatus

export type RoomStatusFilter = RoomStatus | 'all'

/** Configuration matérielle d'une salle (buzzers, lumières…), libre côté API. */
export type RoomConfig = Record<string, unknown>

export type Room = {
  id: number
  companyId: number
  name: string
  config: RoomConfig
  /** Créneaux réservables (lot 13) ; `null` ou absent : pas de créneaux. */
  schedule?: RoomSchedule | null
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

/** Corps de `PUT /companies/:companyId/rooms/:roomId/schedule` : `null` désactive les créneaux. */
export type UpdateRoomSchedulePayload = {
  schedule: RoomSchedule | null
}

/** Un jour du formulaire de créneaux : tout en texte, comme les champs natifs. */
export type RoomScheduleDayFormValues = {
  open: boolean
  opensAt: string
  /** Vide : la première session tombe à l'ouverture. */
  firstSessionAt: string
  closesAt: string
}

export type RoomScheduleFormValues = {
  timezone: string
  slotMinutes: string
  breakMinutes: string
  bookableDesks: string
  publicBooking: boolean
  days: Record<RoomScheduleDayKey, RoomScheduleDayFormValues>
}

export type RoomScheduleFieldErrors = {
  timezone?: string
  slotMinutes?: string
  breakMinutes?: string
  bookableDesks?: string
  days: Partial<Record<RoomScheduleDayKey, string>>
}

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
