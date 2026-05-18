export const COMPANY_STATUS_INACTIVE = 0 as const
export const COMPANY_STATUS_ACTIVE = 1 as const
export const COMPANY_STATUS_DELETED = 2 as const

export const COMPANY_STATUS = {
  INACTIVE: COMPANY_STATUS_INACTIVE,
  ACTIVE: COMPANY_STATUS_ACTIVE,
  DELETED: COMPANY_STATUS_DELETED,
} as const

export type CompanyStatus = (typeof COMPANY_STATUS)[keyof typeof COMPANY_STATUS]

export const ADMIN_STATUS_ACTIVE = 1 as const
export const ADMIN_STATUS_INACTIVE = 2 as const
export const ADMIN_STATUS_DELETED = 3 as const

export const ADMIN_STATUS = {
  ACTIVE: ADMIN_STATUS_ACTIVE,
  INACTIVE: ADMIN_STATUS_INACTIVE,
  DELETED: ADMIN_STATUS_DELETED,
} as const

export type AdminStatus = (typeof ADMIN_STATUS)[keyof typeof ADMIN_STATUS]
