/** Taux de 0 à 1 en pourcentage entier, `null` quand il n'est pas défini. */
export function toPercent(rate: number | null | undefined): number | null {
  return rate === null || rate === undefined || !Number.isFinite(rate)
    ? null
    : Math.round(rate * 100)
}

/** Nombre à une décimale selon la locale (moyenne de joueurs par session), « — » si absent. */
export function formatStatsDecimal(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }

  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
}

/** Nom du jour (1 = lundi à 7 = dimanche) : le 1er janvier 2024 est un lundi. */
export function formatStatsWeekday(weekday: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, weekday))
}

/** Fuseau du navigateur, envoyé à l'API pour ranger les créneaux dans l'heure locale. */
export function getBrowserTimeZone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
}
