import type { FastifyRequest } from 'fastify'

import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
} from '@quizzup/shared'

export type AdminAccessRow = {
  id: number
  role: string
  status: number
}

export function getCurrentAdminId(req: FastifyRequest): number {
  return Number(req.user.sub)
}

export function getCurrentCompanyId(req: FastifyRequest): number {
  return Number(req.user.company_id)
}

export function isSuperadmin(req: FastifyRequest): boolean {
  return req.user.role === ADMIN_ROLE_SUPERADMIN
}

export function isAdmin(req: FastifyRequest): boolean {
  return req.user.role === ADMIN_ROLE_ADMIN
}

export function isUser(req: FastifyRequest): boolean {
  return req.user.role === ADMIN_ROLE_USER
}

export function isSameCompany(req: FastifyRequest, companyId: number): boolean {
  return getCurrentCompanyId(req) === companyId
}

export function isSelfAccount(req: FastifyRequest, companyId: number, adminId: number): boolean {
  return isSameCompany(req, companyId) && getCurrentAdminId(req) === adminId
}

export function isTargetUser(targetAdmin: AdminAccessRow): boolean {
  return targetAdmin.role === ADMIN_ROLE_USER
}

export function canAdminManageCompanyAccount(
  req: FastifyRequest,
  companyId: number,
  targetAdmin: AdminAccessRow,
): boolean {
  if (!isAdmin(req)) {
    return false
  }

  if (!isSameCompany(req, companyId)) {
    return false
  }

  return targetAdmin.role !== ADMIN_ROLE_SUPERADMIN
}

export function canAccessCompanyContext(req: FastifyRequest, companyId: number): boolean {
  if (isSuperadmin(req)) return true

  return isSameCompany(req, companyId)
}

export function canUpdateCompanyContext(req: FastifyRequest, companyId: number): boolean {
  if (isSuperadmin(req)) return true

  return isAdmin(req) && isSameCompany(req, companyId)
}

export function canUpdateCompanyStatusContext(req: FastifyRequest): boolean {
  return isSuperadmin(req)
}

export function canListCompanyAccountsContext(req: FastifyRequest, companyId: number): boolean {
  if (isSuperadmin(req)) return true

  return isAdmin(req) && isSameCompany(req, companyId)
}

export function canCreateCompanyAccountContext(
  req: FastifyRequest,
  companyId: number,
  targetRole: string,
): boolean {
  if (isSuperadmin(req)) return true

  if (!isAdmin(req)) return false

  if (!isSameCompany(req, companyId)) return false

  return targetRole !== ADMIN_ROLE_SUPERADMIN
}

export function canReadCompanyAccountContext(
  req: FastifyRequest,
  companyId: number,
  adminId: number,
): boolean {
  if (isSuperadmin(req)) return true

  if (isAdmin(req) && isSameCompany(req, companyId)) return true

  return isSelfAccount(req, companyId, adminId)
}

export function canUpdateCompanyAccountContext(
  req: FastifyRequest,
  companyId: number,
  adminId: number,
  targetAdmin: AdminAccessRow,
  body: { role?: string; status?: number },
): boolean {
  if (isSuperadmin(req)) return true

  if (canAdminManageCompanyAccount(req, companyId, targetAdmin)) {
    if (body.role === ADMIN_ROLE_SUPERADMIN) return false

    return true
  }

  if (isSelfAccount(req, companyId, adminId)) {
    if (body.role !== undefined) return false
    if (body.status !== undefined) return false

    return true
  }

  return false
}

export function canUpdateCompanyAccountStatusContext(
  req: FastifyRequest,
  companyId: number,
  targetAdmin: AdminAccessRow,
): boolean {
  if (isSuperadmin(req)) return true

  return canAdminManageCompanyAccount(req, companyId, targetAdmin)
}

export function canDeleteCompanyAccountContext(
  req: FastifyRequest,
  companyId: number,
  targetAdmin: AdminAccessRow,
): boolean {
  if (isSuperadmin(req)) return true

  return canAdminManageCompanyAccount(req, companyId, targetAdmin)
}
