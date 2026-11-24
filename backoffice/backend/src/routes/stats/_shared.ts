import { STATS_DEFAULT_PERIOD_DAYS, STATS_MAX_PERIOD_DAYS } from '@quizzup/shared'

const DAY_MS = 24 * 60 * 60 * 1000
// Une période choisie en jours locaux dure 366 jours à une heure près quand elle enjambe un
// changement d'heure : la tolérance évite de refuser « du 1er mars au 1er mars suivant ».
const DST_TOLERANCE_MS = 2 * 60 * 60 * 1000

/** Fuseau utilisé pour les créneaux quand le navigateur n'en envoie pas. */
export const STATS_DEFAULT_TIME_ZONE = 'UTC'

/**
 * Période demandée, `[from, to)`. Sans `to` : maintenant ; sans `from` : 30 jours avant `to`.
 * `null` si elle est vide, inversée ou plus longue que 366 jours.
 */
export function resolveStatsPeriod(
  fromInput: string | undefined,
  toInput: string | undefined,
  now: Date = new Date()
): { from: Date; to: Date } | null {
  const to = toInput ? new Date(toInput) : now
  const from = fromInput
    ? new Date(fromInput)
    : new Date(to.getTime() - STATS_DEFAULT_PERIOD_DAYS * DAY_MS)
  const length = to.getTime() - from.getTime()

  if (length <= 0 || length > STATS_MAX_PERIOD_DAYS * DAY_MS + DST_TOLERANCE_MS) {
    return null
  }

  return { from, to }
}
