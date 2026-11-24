import type {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'

export type CompanyRow = {
  id: number
  name: string
  email: string
  status: CompanyStatus
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
  accountsCount: number
  logoUrl: string | null
  /** Libellé des bons de fidélisation ; nul = bons désactivés. */
  voucherLabel: string | null
  voucherValidityDays: number
}

/** Compagnie telle que lue en base : `logoKey` (clé de stockage) ne sort jamais de l'API. */
export type CompanyDbRow = Omit<CompanyRow, 'logoUrl'> & { logoKey?: string | null }

export type CompanyCreateBody = {
  name: string
  email: string
}

export type CompanyStatusUpdateBody = {
  status: CompanyStatus
}

export type CompanyStatus =
  typeof COMPANY_STATUS_INACTIVE | typeof COMPANY_STATUS_ACTIVE | typeof COMPANY_STATUS_DELETED

export type CompanyUpdateBody = {
  name?: string
  email?: string
  status?: CompanyStatus
  voucherLabel?: string | null
  voucherValidityDays?: number
}
