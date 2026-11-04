import { isSuperadminRole } from '@/utils/company/details/permissions'

type GameCompanyUser = {
  role?: string | null
  companyId?: string | number | null
} | null

function toPositiveInteger(value: unknown): number | null {
  const rawValue = Array.isArray(value) ? value[0] : value

  if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
    return null
  }

  const parsed = Number(rawValue)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Compagnie dont on affiche les parties : celle de l'utilisateur connecté, sauf pour le
 * superadmin qui peut en choisir une autre (paramètre `companyId` de la query-string).
 */
export function resolveGameCompanyId(
  user: GameCompanyUser,
  queryCompanyId?: unknown
): number | null {
  if (isSuperadminRole(user?.role)) {
    const selectedCompanyId = toPositiveInteger(queryCompanyId)

    if (selectedCompanyId !== null) {
      return selectedCompanyId
    }
  }

  return toPositiveInteger(user?.companyId)
}

export function parseGameId(value: unknown): number | null {
  return toPositiveInteger(value)
}
