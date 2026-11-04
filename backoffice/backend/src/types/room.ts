import type { RoomStatus } from '@quizzup/shared'

/** Configuration matérielle d'une salle (buzzers, lumières, fumée), libre côté API. */
export type RoomConfig = Record<string, unknown>

export type RoomRow = {
  id: number
  companyId: number
  name: string
  config: RoomConfig
  status: RoomStatus
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
}
