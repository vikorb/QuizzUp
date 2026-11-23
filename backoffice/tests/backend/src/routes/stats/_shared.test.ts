import { describe, expect, it } from 'vitest'

import { isSupportedTimeZone, resolveStatsPeriod } from '@backend/routes/stats/_shared'

const NOW = new Date('2026-11-23T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

describe('routes/stats/_shared — resolveStatsPeriod', () => {
  it('defaults to the 30 days before now', () => {
    expect(resolveStatsPeriod(undefined, undefined, NOW)).toEqual({
      from: new Date(NOW.getTime() - 30 * DAY_MS),
      to: NOW,
    })
  })

  it('counts the 30 days back from `to` when only `to` is given', () => {
    const to = '2026-03-31T00:00:00.000Z'

    expect(resolveStatsPeriod(undefined, to, NOW)).toEqual({
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date(to),
    })
  })

  it('ends now when only `from` is given', () => {
    expect(resolveStatsPeriod('2026-11-01T00:00:00.000Z', undefined, NOW)).toEqual({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: NOW,
    })
  })

  it('refuses an empty or inverted period', () => {
    expect(resolveStatsPeriod('2026-04-01T00:00:00Z', '2026-04-01T00:00:00Z', NOW)).toBeNull()
    expect(resolveStatsPeriod('2026-04-02T00:00:00Z', '2026-04-01T00:00:00Z', NOW)).toBeNull()
  })

  it('accepts 366 days plus an hour of clock change, and refuses beyond', () => {
    const from = '2026-03-01T00:00:00Z'

    expect(resolveStatsPeriod(from, '2027-03-02T00:00:00Z', NOW)).not.toBeNull()
    // Un jour local de 25 heures (retour à l'heure d'hiver) ajoute une heure à 366 jours.
    expect(resolveStatsPeriod(from, '2027-03-02T01:00:00Z', NOW)).not.toBeNull()
    expect(resolveStatsPeriod(from, '2027-03-02T03:00:00Z', NOW)).toBeNull()
    expect(resolveStatsPeriod(from, '2027-03-04T00:00:00Z', NOW)).toBeNull()
  })
})

describe('routes/stats/_shared — isSupportedTimeZone', () => {
  it.each([
    'UTC',
    'Europe/Paris',
    'America/Argentina/Buenos_Aires',
    'Asia/Kolkata',
    'Asia/Calcutta',
  ])('accepts the IANA name %s, canonical or not', (timeZone) => {
    expect(isSupportedTimeZone(timeZone)).toBe(true)
  })

  it.each(['', '+02:00', '-0500', 'Mars/Olympus', 'Europe/', 'Europe/Paris; select 1', 'UTC+3'])(
    'refuses %j',
    (timeZone) => {
      expect(isSupportedTimeZone(timeZone)).toBe(false)
    }
  )
})
