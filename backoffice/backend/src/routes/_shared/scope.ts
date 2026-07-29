import type { FastifyRequest } from 'fastify'

import { THEME_SCOPE_COMPANY, THEME_SCOPE_GLOBAL, type ThemeScope } from '@quizzup/shared'
import { getCurrentCompanyId, isSuperadmin } from '../../security/companiesPolicy'

/**
 * Ressource scopée (thème ou question) : seuls `scope` et `company_id` entrent
 * dans les décisions de lecture/écriture. Le patron est identique pour les deux
 * ressources, on le factorise ici pour éviter la duplication entre les `_shared`.
 */
export type ScopedResource = {
  scope: ThemeScope
  company_id: number | null
}

export function getScope(req: FastifyRequest, requestedScope?: ThemeScope): ThemeScope {
  return isSuperadmin(req) ? (requestedScope ?? THEME_SCOPE_GLOBAL) : THEME_SCOPE_COMPANY
}

export function getScopedCompanyId(
  req: FastifyRequest,
  scope: ThemeScope,
  requestedCompanyId?: number | null
): number | null {
  if (scope === THEME_SCOPE_GLOBAL) {
    return null
  }

  return isSuperadmin(req) ? (requestedCompanyId ?? null) : getCurrentCompanyId(req)
}

export function canReadScoped(resource: ScopedResource, req: FastifyRequest): boolean {
  const currentCompanyId = getCurrentCompanyId(req)

  return (
    isSuperadmin(req) ||
    resource.scope === THEME_SCOPE_GLOBAL ||
    (resource.scope === THEME_SCOPE_COMPANY && resource.company_id === currentCompanyId)
  )
}

export function canEditScopedForScope(
  req: FastifyRequest,
  scope: ThemeScope,
  companyId: number | null
): boolean {
  const currentCompanyId = getCurrentCompanyId(req)

  return isSuperadmin(req) || (scope === THEME_SCOPE_COMPANY && companyId === currentCompanyId)
}

export function canEditScoped(resource: ScopedResource, req: FastifyRequest): boolean {
  return canEditScopedForScope(req, resource.scope, resource.company_id)
}
