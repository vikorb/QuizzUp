export const COMPANY_STATUS_INACTIVE = 0 as const
export const COMPANY_STATUS_ACTIVE = 1 as const
export const COMPANY_STATUS_DELETED = 2 as const

export const COMPANY_STATUS = {
  INACTIVE: COMPANY_STATUS_INACTIVE,
  ACTIVE: COMPANY_STATUS_ACTIVE,
  DELETED: COMPANY_STATUS_DELETED,
} as const

export type CompanyStatus = (typeof COMPANY_STATUS)[keyof typeof COMPANY_STATUS]

export const ADMIN_STATUS_INACTIVE = 0 as const
export const ADMIN_STATUS_ACTIVE = 1 as const
export const ADMIN_STATUS_DELETED = 2 as const

export const ADMIN_STATUS = {
  ACTIVE: ADMIN_STATUS_ACTIVE,
  INACTIVE: ADMIN_STATUS_INACTIVE,
  DELETED: ADMIN_STATUS_DELETED,
} as const

export type AdminStatus = (typeof ADMIN_STATUS)[keyof typeof ADMIN_STATUS]

export const ADMIN_ROLE_SUPERADMIN = 'superadmin' as const
export const ADMIN_ROLE_ADMIN = 'admin' as const
export const ADMIN_ROLE_USER = 'user' as const

export const ADMIN_ROLE = {
  SUPERADMIN: ADMIN_ROLE_SUPERADMIN,
  ADMIN: ADMIN_ROLE_ADMIN,
  USER: ADMIN_ROLE_USER,
} as const

export type AdminRole = (typeof ADMIN_ROLE)[keyof typeof ADMIN_ROLE]
