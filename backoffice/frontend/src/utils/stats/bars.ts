import type { Stat } from '@/components/ui/StatBar.vue'
import type { CompanyStats } from '@/types/stats'

import { toPercent } from './format'

export type StatsTranslate = (key: string, named?: Record<string, unknown>) => string

function rateStat(
  t: StatsTranslate,
  name: string,
  value: number,
  rate: number | null | undefined
): Stat {
  const percent = toPercent(rate)

  return {
    label: t(`stats.bars.${name}`),
    value,
    ratio: percent ?? 0,
    hint: percent === null ? '—' : t(`stats.bars.${name}Hint`, { percent }),
  }
}

/**
 * Les cinq indicateurs qui sont une part d'un tout : le chiffre, et la jauge avec son pourcentage
 * écrit (la jauge seule ne se lit pas sans la valeur).
 */
export function buildStatsBars(stats: CompanyStats, t: StatsTranslate): Stat[] {
  const { sessions, players } = stats
  const started = sessions.finished + sessions.aborted

  return [
    rateStat(t, 'finished', sessions.finished, started === 0 ? null : sessions.finished / started),
    rateStat(t, 'aborted', sessions.aborted, sessions.abandonRate),
    rateStat(t, 'withEmail', players.withEmail, players.emailRate),
    rateStat(t, 'withMarketingConsent', players.withMarketingConsent, players.marketingConsentRate),
    rateStat(
      t,
      'returning',
      players.returningEmails,
      players.distinctEmails === 0 ? null : players.returningEmails / players.distinctEmails
    ),
  ]
}
