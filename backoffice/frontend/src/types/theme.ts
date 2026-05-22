import type {
  ThemeMode,
  ThemeScope,
  ThemeStatus,
} from '@quizzup/shared'

export type Theme = {
  id: number
  adminId: number
  companyId: number | null
  scope: ThemeScope
  name: string
  mode: ThemeMode
  status: ThemeStatus
  createdAt?: string
  updatedAt?: string | null
  deletedAt?: string | null
  canEdit?: boolean
}

export type ThemePayload = {
  name: string
  mode: ThemeMode
  scope?: ThemeScope
  companyId?: number | null
}

export type ThemeFilters = {
  search?: string
  mode?: string
  status?: string
  scope?: string
}
