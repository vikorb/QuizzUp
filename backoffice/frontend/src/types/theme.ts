import type { ThemeMode, ThemeScope, ThemeStatus } from '@quizzup/shared'

export type Theme = {
  id: number
  adminId: number
  companyId: number | null
  scope: ThemeScope
  name: string
  mode: ThemeMode
  playlistRef?: string | null
  status: ThemeStatus
  questionsCount?: number
  createdAt?: string
  updatedAt?: string | null
  deletedAt?: string | null
}

export type ThemePayload = {
  name: string
  mode: ThemeMode
  scope?: ThemeScope
  companyId?: number | null
  /** Absent : inchangé ; `null` : efface la playlist. */
  playlistRef?: string | null
}

export type ThemeFilters = {
  search?: string
  mode?: string
  status?: string
  scope?: string
}
