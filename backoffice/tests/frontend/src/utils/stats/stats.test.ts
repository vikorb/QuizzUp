import { statsFixture } from '@frontend-tests/_helpers/statsServiceMock'
import { describe, expect, it } from 'vitest'

import { buildStatsBars } from '@/utils/stats/bars'
import { getStatsErrorKey, readStatsApiError } from '@/utils/stats/errors'
import {
  formatStatsDecimal,
  formatStatsWeekday,
  getBrowserTimeZone,
  toPercent,
} from '@/utils/stats/format'

// Une traduction qui garde les paramètres : on lit ce que l'écran afficherait.
const t = (key: string, named?: Record<string, unknown>) =>
  named ? `${key}:${JSON.stringify(named)}` : key

describe('utils/stats/errors', () => {
  it('turns an API code into the i18n key of the stats namespace', () => {
    expect(getStatsErrorKey('stats_period_invalid')).toBe('stats.errors.statsPeriodInvalid')
    expect(getStatsErrorKey('stats_timezone_invalid')).toBe('stats.errors.statsTimezoneInvalid')
    expect(getStatsErrorKey('api_unreachable')).toBe('stats.errors.apiUnreachable')
  })

  it('shows the server error text for a code it does not know', () => {
    expect(getStatsErrorKey('room_busy')).toBe('stats.errors.serverError')
    expect(getStatsErrorKey(null)).toBe('stats.errors.serverError')
  })

  it('reads only known codes from a payload', () => {
    expect(readStatsApiError({ error: 'stats_period_invalid' })).toBe('stats_period_invalid')
    expect(readStatsApiError({ error: 'room_busy' })).toBeNull()
    expect(readStatsApiError(null)).toBeNull()
    expect(readStatsApiError('forbidden')).toBeNull()
  })
})

describe('utils/stats/format', () => {
  it('rounds a rate to a whole percentage', () => {
    expect(toPercent(0.8571)).toBe(86)
    expect(toPercent(0)).toBe(0)
    expect(toPercent(1)).toBe(100)
    expect(toPercent(null)).toBeNull()
    expect(toPercent(undefined)).toBeNull()
    expect(toPercent(Number.NaN)).toBeNull()
  })

  it('formats a decimal with the locale, and a dash when there is none', () => {
    expect(formatStatsDecimal(2.6, 'fr')).toBe('2,6')
    expect(formatStatsDecimal(2.6, 'en')).toBe('2.6')
    expect(formatStatsDecimal(3, 'fr')).toBe('3')
    expect(formatStatsDecimal(null, 'fr')).toBe('—')
  })

  it('names the days from Monday (1) to Sunday (7)', () => {
    expect(formatStatsWeekday(1, 'fr')).toBe('lundi')
    expect(formatStatsWeekday(6, 'fr')).toBe('samedi')
    expect(formatStatsWeekday(7, 'en')).toBe('Sunday')
  })

  it('reads the time zone of the browser', () => {
    expect(getBrowserTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})

describe('utils/stats/bars', () => {
  it('builds the five shares with their value, gauge and written percentage', () => {
    const bars = buildStatsBars(statsFixture, t)

    expect(bars.map((bar) => [bar.label, bar.value, bar.ratio, bar.hint])).toEqual([
      ['stats.bars.finished', 8, 80, 'stats.bars.finishedHint:{"percent":80}'],
      ['stats.bars.aborted', 2, 20, 'stats.bars.abortedHint:{"percent":20}'],
      ['stats.bars.withEmail', 14, 67, 'stats.bars.withEmailHint:{"percent":67}'],
      [
        'stats.bars.withMarketingConsent',
        7,
        33,
        'stats.bars.withMarketingConsentHint:{"percent":33}',
      ],
      ['stats.bars.returning', 3, 25, 'stats.bars.returningHint:{"percent":25}'],
    ])
  })

  it('shows a dash and an empty gauge when a share has no whole to divide', () => {
    const empty = {
      ...statsFixture,
      sessions: { ...statsFixture.sessions, finished: 0, aborted: 0, abandonRate: null },
      players: {
        ...statsFixture.players,
        total: 0,
        withEmail: 0,
        emailRate: null,
        withMarketingConsent: 0,
        marketingConsentRate: null,
        distinctEmails: 0,
        returningEmails: 0,
      },
    }

    for (const bar of buildStatsBars(empty, t)) {
      expect(bar).toMatchObject({ value: 0, ratio: 0, hint: '—' })
    }
  })
})
