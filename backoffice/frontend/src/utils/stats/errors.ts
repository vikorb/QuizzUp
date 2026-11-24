import type { StatsApiErrorCode } from '@/types/stats'

const STATS_API_ERROR_CODES: StatsApiErrorCode[] = [
  'unauthorized',
  'forbidden',
  'api_unreachable',
  'invalid_json',
  'invalid_params',
  'stats_period_invalid',
  'stats_timezone_invalid',
  'server_error',
]

function isStatsApiErrorCode(value: unknown): value is StatsApiErrorCode {
  return typeof value === 'string' && STATS_API_ERROR_CODES.includes(value as StatsApiErrorCode)
}

/** Code d'erreur d'une réponse de l'API des statistiques, `null` s'il est inconnu. */
export function readStatsApiError(payload: unknown): StatsApiErrorCode | null {
  const error = (payload as { error?: unknown } | null)?.error

  return isStatsApiErrorCode(error) ? error : null
}

/** `stats_period_invalid` → `stats.errors.statsPeriodInvalid` : clé i18n d'un code d'erreur. */
export function getStatsErrorKey(code: string | null | undefined): string {
  const known = isStatsApiErrorCode(code) ? code : 'server_error'

  return `stats.errors.${known.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())}`
}
