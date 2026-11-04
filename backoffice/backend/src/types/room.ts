import type { RoomStatus } from '@quizzup/shared'

/** Configuration matérielle d'une salle (buzzers, lumières, fumée), libre côté API. */
export type RoomConfig = Record<string, unknown>

export type RoomRow = {
  id: number
  companyId: number
  name: string
  config: RoomConfig
  /** Augmente de 1 à chaque écriture de `config` (détection des écritures concurrentes). */
  configRevision: number
  status: RoomStatus
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
}

/** Salle de la liste d'une compagnie : avec son nombre de pupitres (défaut 4, de 1 à 6). */
export type RoomListItem = RoomRow & { desksCount: number }
