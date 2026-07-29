import type { FastifyRequest } from 'fastify'

import { ADMIN_ROLE_USER, type AdminRole } from '@quizzup/shared'

type AuthPayload = {
  id?: number | string
  adminId?: number | string
  sub?: number | string
  role?: AdminRole | string
}

type AuthenticatedRequest = FastifyRequest & {
  user?: AuthPayload
  admin?: AuthPayload
}

/**
 * Identifiant de l'admin courant.
 *
 * Source de vérité unique partagée par les routes (`questions`, `themes`) et la
 * politique de sécurité (`companiesPolicy`). Le token JWT ne porte que `sub`
 * (cf. `plugins/auth.ts`) ; la chaîne de fallback couvre les autres formes de
 * payload sans jamais faire confiance à une valeur non entière/positive.
 */
export function getCurrentAdminId(req: FastifyRequest): number | null {
  const authReq = req as AuthenticatedRequest
  const value =
    authReq.user?.adminId ??
    authReq.user?.id ??
    authReq.user?.sub ??
    authReq.admin?.adminId ??
    authReq.admin?.id

  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function getCurrentAdminRole(req: FastifyRequest): string | null {
  const authReq = req as AuthenticatedRequest

  return authReq.user?.role ?? authReq.admin?.role ?? null
}

export function isUserRole(req: FastifyRequest): boolean {
  return getCurrentAdminRole(req) === ADMIN_ROLE_USER
}

export function parsePositiveId(value: unknown): number | null {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = Number(value)

  return Number.isInteger(parsed) ? parsed : null
}
