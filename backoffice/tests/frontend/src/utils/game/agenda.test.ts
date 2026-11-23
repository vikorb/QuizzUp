import {
  createGameFixture,
  createScheduledGameFixture,
  createScheduleFixture,
} from '@frontend-tests/_helpers/gamesServiceMock'
import {
  GAME_STATE_ABORTED,
  GAME_STATE_CANCELLED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_DELETED,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import type { Game } from '@/types/game'
import {
  type AgendaEntry,
  buildAgendaTimeline,
  canCancelScheduledGame,
  canOpenScheduledGame,
  formatAgendaTime,
  getAgendaStateKind,
  getAgendaStateLabelKey,
  getAgendaStateTone,
  getAgendaWindow,
  getLocalDate,
  getRoomTimezone,
  isCalendarDate,
  shiftDate,
} from '@/utils/game/agenda'

const PARIS = 'Europe/Paris'
const WINTER_NOW = new Date('2026-11-23T10:00:00.000Z')

/** `slot 10:00` pour un créneau libre (heure locale de la grille), `game 5` pour une session. */
function summarize(entries: AgendaEntry[]): string[] {
  return entries.map((entry) =>
    entry.kind === 'slot' ? `slot ${entry.slot.localTime}` : `game ${entry.game.id}`
  )
}

describe('utils/game/agenda', () => {
  describe('time zone and calendar days', () => {
    it('uses the time zone of the room, or the default one without slots', () => {
      expect(getRoomTimezone(createScheduleFixture(undefined, 'America/Montreal'))).toBe(
        'America/Montreal'
      )
      expect(getRoomTimezone(null)).toBe(PARIS)
      expect(getRoomTimezone(undefined)).toBe(PARIS)
    })

    it('reads the calendar day of an instant in the room time zone, not in the browser one', () => {
      const instant = Date.parse('2026-11-23T23:30:00.000Z')

      expect(getLocalDate(instant, PARIS)).toBe('2026-11-24')
      expect(getLocalDate(instant, 'America/New_York')).toBe('2026-11-23')
    })

    it('accepts only a complete calendar day', () => {
      expect(isCalendarDate('2027-03-28')).toBe(true)
      expect(isCalendarDate('')).toBe(false)
      expect(isCalendarDate('2027-3-8')).toBe(false)
      expect(isCalendarDate('2027-13-01')).toBe(false)
    })

    it('shifts a day across month and year ends', () => {
      expect(shiftDate('2027-03-28', 1)).toBe('2027-03-29')
      expect(shiftDate('2027-03-01', -1)).toBe('2027-02-28')
      expect(shiftDate('2027-12-31', 1)).toBe('2028-01-01')
      expect(shiftDate('2027-03-28', 0)).toBe('2027-03-28')
    })
  })

  describe('getAgendaWindow', () => {
    it('asks for the local day and the next one, in UTC', () => {
      expect(getAgendaWindow('2026-11-24', PARIS)).toEqual({
        from: '2026-11-23T23:00:00.000Z',
        to: '2026-11-25T23:00:00.000Z',
      })
    })

    it('follows the spring change (the day of the change is 23 hours long)', () => {
      expect(getAgendaWindow('2027-03-28', PARIS)).toEqual({
        from: '2027-03-27T23:00:00.000Z',
        to: '2027-03-29T22:00:00.000Z',
      })
    })

    it('follows the autumn change (the day of the change is 25 hours long)', () => {
      expect(getAgendaWindow('2027-10-31', PARIS)).toEqual({
        from: '2027-10-30T22:00:00.000Z',
        to: '2027-11-01T23:00:00.000Z',
      })
    })

    it('starts at 01:00 when midnight does not exist that day', () => {
      // Cuba passe à l'heure d'été à minuit : le 14 mars 2027, 00:00 n'existe pas.
      expect(getAgendaWindow('2027-03-14', 'America/Havana')).toEqual({
        from: '2027-03-14T05:00:00.000Z',
        to: '2027-03-16T04:00:00.000Z',
      })
    })
  })

  describe('buildAgendaTimeline', () => {
    const schedule = createScheduleFixture()
    const build = (games: Game[] = [], now = WINTER_NOW) =>
      buildAgendaTimeline({ schedule, date: '2026-12-01', now, games })

    it('lists the free slots of the grid in the room local time', () => {
      const entries = build()

      expect(summarize(entries)).toEqual(['slot 10:00', 'slot 11:00', 'slot 12:00', 'slot 13:00'])
      expect(entries[0]?.startMs).toBe(Date.parse('2026-12-01T09:00:00.000Z'))
    })

    it('replaces the slot taken by a session with that session, in chronological order', () => {
      const game = createScheduledGameFixture('2026-12-01T10:00:00.000Z', { id: 5 })

      expect(summarize(build([game]))).toEqual(['slot 10:00', 'game 5', 'slot 12:00', 'slot 13:00'])
    })

    it('frees the slot of a cancelled session and hides it', () => {
      const game = createScheduledGameFixture('2026-12-01T10:00:00.000Z', {
        id: 5,
        state: GAME_STATE_CANCELLED,
      })

      expect(summarize(build([game]))).toEqual([
        'slot 10:00',
        'slot 11:00',
        'slot 12:00',
        'slot 13:00',
      ])
    })

    it('hides a deleted session and frees its slot', () => {
      const game = createScheduledGameFixture('2026-12-01T10:00:00.000Z', {
        id: 5,
        status: GAME_STATUS_DELETED,
      })

      expect(summarize(build([game]))).toEqual([
        'slot 10:00',
        'slot 11:00',
        'slot 12:00',
        'slot 13:00',
      ])
    })

    it('shows a stopped session before the free slot it freed', () => {
      const game = createScheduledGameFixture('2026-12-01T10:00:00.000Z', {
        id: 5,
        state: GAME_STATE_ABORTED,
      })

      expect(summarize(build([game]))).toEqual([
        'slot 10:00',
        'game 5',
        'slot 11:00',
        'slot 12:00',
        'slot 13:00',
      ])
    })

    it('shows an immediate game at its start time without taking a slot', () => {
      const game = createGameFixture({
        id: 6,
        state: GAME_STATE_RUNNING,
        startedAt: '2026-12-01T09:30:00.000Z',
        scheduledAt: null,
        scheduledEndAt: null,
      })

      expect(summarize(build([game]))).toEqual([
        'slot 10:00',
        'game 6',
        'slot 11:00',
        'slot 12:00',
        'slot 13:00',
      ])
    })

    it('hides the slots already started', () => {
      const now = new Date('2026-12-01T10:30:00.000Z')

      expect(summarize(build([], now))).toEqual(['slot 12:00', 'slot 13:00'])
    })

    it('shows only the sessions when the room has no slots set up', () => {
      const game = createScheduledGameFixture('2026-12-01T10:00:00.000Z', { id: 5 })

      expect(
        summarize(
          buildAgendaTimeline({
            schedule: null,
            date: '2026-12-01',
            now: WINTER_NOW,
            games: [game],
          })
        )
      ).toEqual(['game 5'])
    })

    it('shows nothing on a closed day', () => {
      const closed = { ...schedule, days: {} }

      expect(
        buildAgendaTimeline({ schedule: closed, date: '2026-12-01', now: WINTER_NOW, games: [] })
      ).toEqual([])
    })

    it('keeps the slots after midnight on the opening day and counts their sessions as busy', () => {
      const night = createScheduleFixture({ opensAt: '22:00', closesAt: '02:00' })
      // 00:00 locale du 2 décembre : hors du jour affiché, mais elle occupe le créneau de minuit.
      const game = createScheduledGameFixture('2026-12-01T23:00:00.000Z', { id: 7 })

      const entries = buildAgendaTimeline({
        schedule: night,
        date: '2026-12-01',
        now: WINTER_NOW,
        games: [game],
      })

      // La session de minuit reste sur le jour d'ouverture, à son heure.
      expect(summarize(entries)).toEqual(['slot 22:00', 'slot 23:00', 'game 7', 'slot 01:00'])
    })

    it('shows a session after midnight on the opening day only, not on the next day', () => {
      const night = createScheduleFixture({ opensAt: '22:00', closesAt: '02:00' })
      const game = createScheduledGameFixture('2026-12-01T23:00:00.000Z', { id: 7 })
      const buildOn = (date: string) =>
        summarize(buildAgendaTimeline({ schedule: night, date, now: WINTER_NOW, games: [game] }))

      expect(buildOn('2026-12-01')).toContain('game 7')
      expect(buildOn('2026-12-02')).toEqual([
        'slot 22:00',
        'slot 23:00',
        'slot 00:00',
        'slot 01:00',
      ])
    })

    it('ends the opening day with its grid: 01:30 belongs to the day before, 02:00 does not', () => {
      const night = createScheduleFixture({ opensAt: '22:00', closesAt: '02:00' })
      const games = [
        // 01:30 locale du 2 décembre : encore dans la grille du 1er (qui finit à 02:00).
        createScheduledGameFixture('2026-12-02T00:30:00.000Z', { id: 8 }),
        // 02:00 locale : la grille du 1er est finie, la session appartient au 2.
        createScheduledGameFixture('2026-12-02T01:00:00.000Z', { id: 9 }),
      ]
      const buildOn = (date: string) =>
        summarize(buildAgendaTimeline({ schedule: night, date, now: WINTER_NOW, games }))

      expect(buildOn('2026-12-01')).toContain('game 8')
      expect(buildOn('2026-12-01')).not.toContain('game 9')
      expect(buildOn('2026-12-02')).not.toContain('game 8')
      expect(buildOn('2026-12-02')).toContain('game 9')
    })

    it('breaks a tie in favour of the session', () => {
      const game = createScheduledGameFixture('2026-12-01T09:00:00.000Z', {
        id: 5,
        state: GAME_STATE_ABORTED,
      })

      expect(summarize(build([game])).slice(0, 2)).toEqual(['game 5', 'slot 10:00'])
    })

    describe('daylight saving time changes in the room time zone', () => {
      const night = createScheduleFixture({ opensAt: '01:00', closesAt: '05:00' })
      const now = new Date('2027-03-20T12:00:00.000Z')

      it('skips the hour that does not exist when the clocks go forward', () => {
        const entries = buildAgendaTimeline({ schedule: night, date: '2027-03-28', now, games: [] })

        expect(summarize(entries)).toEqual(['slot 01:00', 'slot 03:00', 'slot 04:00'])
        expect(entries.map((entry) => formatAgendaTime(entry.startMs, PARIS, 'fr'))).toEqual([
          '01:00',
          '03:00',
          '04:00',
        ])
        expect(entries.map((entry) => new Date(entry.startMs).toISOString())).toEqual([
          '2027-03-28T00:00:00.000Z',
          '2027-03-28T01:00:00.000Z',
          '2027-03-28T02:00:00.000Z',
        ])
      })

      it('offers the repeated hour once, then the next ones, when the clocks go back', () => {
        const entries = buildAgendaTimeline({
          schedule: night,
          date: '2027-10-31',
          now: new Date('2027-10-20T12:00:00.000Z'),
          games: [],
        })

        expect(entries.map((entry) => new Date(entry.startMs).toISOString())).toEqual([
          '2027-10-30T23:00:00.000Z',
          '2027-10-31T00:00:00.000Z',
          '2027-10-31T02:00:00.000Z',
          '2027-10-31T03:00:00.000Z',
        ])
        expect(entries.map((entry) => formatAgendaTime(entry.startMs, PARIS, 'fr'))).toEqual([
          '01:00',
          '02:00',
          '03:00',
          '04:00',
        ])
      })

      it('keeps the sessions of the 23-hour day and drops the one of the next day', () => {
        const games = [
          // 00:00 locale du 28 mars : premier instant du jour.
          createScheduledGameFixture('2027-03-27T23:00:00.000Z', { id: 1 }),
          // 23:30 locale du 28 mars : dernier instant du jour.
          createScheduledGameFixture('2027-03-28T21:30:00.000Z', { id: 2 }),
          // 00:00 locale du 29 mars : jour suivant.
          createScheduledGameFixture('2027-03-28T22:00:00.000Z', { id: 3 }),
        ]

        const entries = buildAgendaTimeline({ schedule: night, date: '2027-03-28', now, games })

        expect(summarize(entries)).toEqual([
          'game 1',
          'slot 01:00',
          'slot 03:00',
          'slot 04:00',
          'game 2',
        ])
      })

      it('stops the day of the autumn change after 25 hours', () => {
        const games = [
          // 23:30 locale du 31 octobre (UTC+1) : dernier instant du jour.
          createScheduledGameFixture('2027-10-31T22:30:00.000Z', { id: 2 }),
          // 00:00 locale du 1er novembre : jour suivant.
          createScheduledGameFixture('2027-10-31T23:00:00.000Z', { id: 3 }),
        ]

        const entries = buildAgendaTimeline({
          schedule: null,
          date: '2027-10-31',
          now,
          games,
        })

        expect(summarize(entries)).toEqual(['game 2'])
      })
    })
  })

  describe('states', () => {
    const nowMs = Date.parse('2026-12-01T10:30:00.000Z')

    it('shows a scheduled session whose slot is over as not launched', () => {
      const over = createScheduledGameFixture('2026-12-01T09:00:00.000Z')

      expect(getAgendaStateKind(over, nowMs)).toBe('not_launched')
      expect(
        getAgendaStateKind(createScheduledGameFixture('2026-12-01T10:00:00.000Z'), nowMs)
      ).toBe('scheduled')
    })

    it('treats the end of the slot as not launched', () => {
      const game = createScheduledGameFixture('2026-12-01T09:30:00.000Z')

      expect(getAgendaStateKind(game, Date.parse(game.scheduledEndAt ?? ''))).toBe('not_launched')
    })

    it('keeps the stored state for every other session', () => {
      expect(
        getAgendaStateKind(
          createScheduledGameFixture('2026-12-01T09:00:00.000Z', { state: GAME_STATE_PENDING }),
          nowMs
        )
      ).toBe('pending')
      expect(getAgendaStateKind(createGameFixture({ state: GAME_STATE_RUNNING }), nowMs)).toBe(
        'running'
      )
    })

    it('does not call a scheduled session without an end not launched', () => {
      expect(
        getAgendaStateKind(
          createGameFixture({ state: GAME_STATE_SCHEDULED, scheduledEndAt: null }),
          nowMs
        )
      ).toBe('scheduled')
    })

    it('gives not launched its own label and a warning tone', () => {
      expect(getAgendaStateLabelKey('not_launched')).toBe('agenda.state.notLaunched')
      expect(getAgendaStateTone('not_launched')).toBe('warn')
      expect(getAgendaStateLabelKey('running')).toBe('games.state.running')
      expect(getAgendaStateTone('running')).toBe('ok')
    })
  })

  describe('actions', () => {
    const startsAt = '2026-12-01T10:00:00.000Z'
    const startMs = Date.parse(startsAt)
    const game = createScheduledGameFixture(startsAt)

    it('opens a session from 60 minutes before its start, with no upper bound', () => {
      expect(canOpenScheduledGame(game, startMs - 61 * 60_000)).toBe(false)
      expect(canOpenScheduledGame(game, startMs - 60 * 60_000)).toBe(true)
      expect(canOpenScheduledGame(game, startMs + 3 * 3_600_000)).toBe(true)
    })

    it('opens only a scheduled session that has a start', () => {
      expect(canOpenScheduledGame({ ...game, state: GAME_STATE_PENDING }, startMs)).toBe(false)
      expect(canOpenScheduledGame({ ...game, scheduledAt: null }, startMs)).toBe(false)
    })

    it('cancels only a scheduled session', () => {
      expect(canCancelScheduledGame(game)).toBe(true)
      expect(canCancelScheduledGame({ ...game, state: GAME_STATE_PENDING })).toBe(false)
      expect(canCancelScheduledGame({ ...game, state: GAME_STATE_CANCELLED })).toBe(false)
    })
  })

  describe('formatAgendaTime', () => {
    it('shows the hour in the room time zone on 24 hours, whatever the language', () => {
      expect(formatAgendaTime('2027-07-01T12:00:00.000Z', PARIS, 'fr')).toBe('14:00')
      expect(formatAgendaTime('2027-07-01T12:00:00.000Z', PARIS, 'en')).toBe('14:00')
      expect(formatAgendaTime('2027-07-01T12:00:00.000Z', 'America/New_York', 'en')).toBe('08:00')
    })

    it('reads the same instant with the winter and the summer offset', () => {
      expect(formatAgendaTime('2026-12-01T12:00:00.000Z', PARIS, 'fr')).toBe('13:00')
      expect(formatAgendaTime('2027-03-28T00:59:00.000Z', PARIS, 'fr')).toBe('01:59')
      expect(formatAgendaTime('2027-03-28T01:00:00.000Z', PARIS, 'fr')).toBe('03:00')
      expect(formatAgendaTime('2027-10-31T00:30:00.000Z', PARIS, 'fr')).toBe('02:30')
      expect(formatAgendaTime('2027-10-31T01:30:00.000Z', PARIS, 'fr')).toBe('02:30')
    })

    it('shows midnight as 00:00 and accepts a timestamp', () => {
      expect(formatAgendaTime(Date.parse('2026-12-01T23:00:00.000Z'), PARIS, 'fr')).toBe('00:00')
    })
  })
})
