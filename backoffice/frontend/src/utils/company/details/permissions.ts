import { ADMIN_ROLE_ADMIN, ADMIN_ROLE_SUPERADMIN } from '@quizzup/shared'

export function isSuperadminRole(role: string | null | undefined): boolean {
  return role === ADMIN_ROLE_SUPERADMIN
}

export function isCompanyAdminRole(role: string | null | undefined): boolean {
  return role === ADMIN_ROLE_ADMIN
}

export function canManageCompanyDetails(role: string | null | undefined): boolean {
  return isSuperadminRole(role) || isCompanyAdminRole(role)
}

export function canShowCompanyStatusSwitch(role: string | null | undefined): boolean {
  return isSuperadminRole(role)
}

export function canShowCompanyAccountsSection(role: string | null | undefined): boolean {
  return canManageCompanyDetails(role)
}

export function isCompanyDetailsReadonly(role: string | null | undefined): boolean {
  return !canManageCompanyDetails(role)
}
