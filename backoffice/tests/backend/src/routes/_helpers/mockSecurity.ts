import type { FastifyReply, FastifyRequest } from 'fastify'
import { vi } from 'vitest'

import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  type AdminRole,
} from '@quizzup/shared'

type RequestWithUser = FastifyRequest & {
  user?: {
    sub?: string
    id?: number
    adminId?: number
    company_id?: number
    companyId?: number
    role?: AdminRole
    sid?: string
  }
}

type AdminAccessRow = {
  id: number
  role: AdminRole
  status: number
}

type AccountUpdateContext = {
  role?: AdminRole
  status?: number
}

type SecurityContextOverrides = {
  canAccessCompany?: boolean
  canUpdateCompany?: boolean
  canUpdateCompanyStatus?: boolean
  canListCompanyAccounts?: boolean
  canCreateCompanyAccount?: boolean
  canReadCompanyAccount?: boolean
  canUpdateCompanyAccount?: boolean
  canDeleteCompanyAccount?: boolean
  canUpdateCompanyAccountStatus?: boolean
}

export const securityState: {
  hasPermission: boolean
  context: SecurityContextOverrides
} = {
  hasPermission: true,
  context: {},
}

function getUser(req: FastifyRequest) {
  return (req as RequestWithUser).user ?? {}
}

function getCurrentCompanyIdImpl(req: FastifyRequest): number {
  const user = getUser(req)

  return Number(user.company_id ?? user.companyId)
}

function isSuperadminImpl(req: FastifyRequest): boolean {
  return getUser(req).role === ADMIN_ROLE_SUPERADMIN
}

function isAdminImpl(req: FastifyRequest): boolean {
  return getUser(req).role === ADMIN_ROLE_ADMIN
}

function getCurrentAdminId(req: FastifyRequest): number {
  const user = getUser(req)

  return Number(user.id ?? user.adminId ?? user.sub)
}

function sameCompany(req: FastifyRequest, companyId: number): boolean {
  return getCurrentCompanyIdImpl(req) === companyId
}

export function resetSecurityMocks(): void {
  securityState.hasPermission = true
  securityState.context = {}
  requireApiPermissionMock.mockClear()

  Object.values(companiesPolicyMock).forEach((value) => {
    if (typeof value === 'function' && 'mockClear' in value) {
      value.mockClear()
    }
  })
}

export const requireApiPermissionMock = vi.fn(
  (_req: FastifyRequest, reply: FastifyReply): boolean => {
    if (securityState.hasPermission) {
      return true
    }

    reply.code(403).send({ error: 'forbidden' })

    return false
  },
)

export const companiesPolicyMock = {
  getCurrentCompanyId: vi.fn((req: FastifyRequest) => getCurrentCompanyIdImpl(req)),

  isSuperadmin: vi.fn((req: FastifyRequest) => isSuperadminImpl(req)),

  canAccessCompanyContext: vi.fn((req: FastifyRequest, companyId: number) => {
    return securityState.context.canAccessCompany ?? (isSuperadminImpl(req) || sameCompany(req, companyId))
  }),

  canUpdateCompanyContext: vi.fn((req: FastifyRequest, companyId: number) => {
    return securityState.context.canUpdateCompany ?? (isSuperadminImpl(req) || sameCompany(req, companyId))
  }),

  canUpdateCompanyStatusContext: vi.fn((req: FastifyRequest) => {
    return securityState.context.canUpdateCompanyStatus ?? isSuperadminImpl(req)
  }),

  canListCompanyAccountsContext: vi.fn((req: FastifyRequest, companyId: number) => {
    return (
      securityState.context.canListCompanyAccounts ??
      (isSuperadminImpl(req) || (isAdminImpl(req) && sameCompany(req, companyId)))
    )
  }),

  canCreateCompanyAccountContext: vi.fn(
    (req: FastifyRequest, companyId: number, requestedRole: AdminRole) => {
      const allowedByRole =
        isSuperadminImpl(req) ||
        (isAdminImpl(req) &&
          sameCompany(req, companyId) &&
          requestedRole === ADMIN_ROLE_ADMIN || requestedRole === ADMIN_ROLE_USER)

      return securityState.context.canCreateCompanyAccount ?? allowedByRole
    },
  ),

  canReadCompanyAccountContext: vi.fn(
    (req: FastifyRequest, companyId: number, adminId: number) => {
      return (
        securityState.context.canReadCompanyAccount ??
        (isSuperadminImpl(req) ||
          (sameCompany(req, companyId) && (isAdminImpl(req) || getCurrentAdminId(req) === adminId)))
      )
    },
  ),

  canUpdateCompanyAccountContext: vi.fn(
    (
      req: FastifyRequest,
      companyId: number,
      adminId: number,
      existingAdmin: AdminAccessRow,
      changes: AccountUpdateContext = {},
    ) => {
      const userRole = getUser(req).role
      const wantsSuperadminRole = changes.role === ADMIN_ROLE_SUPERADMIN
      const targetIsSuperadmin = existingAdmin.role === ADMIN_ROLE_SUPERADMIN

      const allowedByRole =
        isSuperadminImpl(req) ||
        (userRole === ADMIN_ROLE_ADMIN &&
          sameCompany(req, companyId) &&
          !targetIsSuperadmin &&
          !wantsSuperadminRole &&
          getCurrentAdminId(req) !== adminId)

      return securityState.context.canUpdateCompanyAccount ?? allowedByRole
    },
  ),

  canDeleteCompanyAccountContext: vi.fn(
    (req: FastifyRequest, companyId: number, existingAdmin: AdminAccessRow) => {
      const allowedByRole =
        isSuperadminImpl(req) ||
        (isAdminImpl(req) &&
          sameCompany(req, companyId) &&
          existingAdmin.role !== ADMIN_ROLE_SUPERADMIN &&
          getCurrentAdminId(req) !== existingAdmin.id)

      return securityState.context.canDeleteCompanyAccount ?? allowedByRole
    },
  ),

  canUpdateCompanyAccountStatusContext: vi.fn(
    (req: FastifyRequest, companyId: number, existingAdmin: AdminAccessRow) => {
      const allowedByRole =
        isSuperadminImpl(req) ||
        (isAdminImpl(req) &&
          sameCompany(req, companyId) &&
          existingAdmin.role !== ADMIN_ROLE_SUPERADMIN &&
          getCurrentAdminId(req) !== existingAdmin.id)

      return securityState.context.canUpdateCompanyAccountStatus ?? allowedByRole
    },
  ),
}
