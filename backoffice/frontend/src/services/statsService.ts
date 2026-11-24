import type { CompanyStats, StatsApiErrorCode, StatsQuery, StatsResult } from '@/types/stats'
import { apiFetch } from '@/utils/api'
import { readStatsApiError } from '@/utils/stats/errors'

function getFallbackErrorCode(status: number): StatsApiErrorCode {
  if (status === 401) {
    return 'unauthorized'
  }

  if (status === 403) {
    return 'forbidden'
  }

  return 'server_error'
}

/** Statistiques d'exploitation d'une compagnie (US-STATS-01). `from` et `to` sont des instants ISO. */
export async function loadStatsService(
  companyId: number,
  query: StatsQuery = {}
): Promise<StatsResult> {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value))
    }
  }

  const queryString = params.toString()
  const response = await apiFetch({
    path: `/companies/${companyId}/stats${queryString ? `?${queryString}` : ''}`,
    authenticated: true,
  })

  if (!response) {
    return { ok: false, status: null, error: 'api_unreachable' }
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)

    return {
      ok: false,
      status: response.status,
      error: readStatsApiError(payload) ?? getFallbackErrorCode(response.status),
    }
  }

  const json = (await response.json().catch(() => null)) as CompanyStats | null

  if (json === null) {
    return { ok: false, status: response.status, error: 'invalid_json' }
  }

  return { ok: true, status: response.status, data: json }
}
