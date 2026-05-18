import type {
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
  ADMIN_STATUS_INACTIVE,
} from '@quizzup/shared'

export type AdminStatus =
  | typeof ADMIN_STATUS_ACTIVE
  | typeof ADMIN_STATUS_INACTIVE
  | typeof ADMIN_STATUS_DELETED

export type AdminRow = {
  id: number
  companyId: number
  role: string
  firstname: string | null
  lastname: string | null
  username: string
  email: string
  status: AdminStatus
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
}

export type AdminStatusUpdateBody = {
  status: AdminStatus
}
