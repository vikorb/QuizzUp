import type { FastifyRequest } from 'fastify'

import { canAccessCompanyContext, canUpdateCompanyContext } from './companiesPolicy'

/** Lecture des salles : superadmin partout, admin et user dans leur compagnie (US-ROOM-01). */
export function canReadRoomsContext(req: FastifyRequest, companyId: number): boolean {
  return canAccessCompanyContext(req, companyId)
}

/** Gestion des salles : superadmin partout, admin dans sa compagnie. */
export function canManageRoomsContext(req: FastifyRequest, companyId: number): boolean {
  return canUpdateCompanyContext(req, companyId)
}
