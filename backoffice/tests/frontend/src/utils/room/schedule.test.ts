import { ROOM_DEFAULT_TIMEZONE, type RoomSchedule } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  buildRoomSchedule,
  createDefaultRoomScheduleFormValues,
  getRoomScheduleApiError,
  getRoomScheduleTimezones,
  hasRoomScheduleFormErrors,
  previewRoomSchedule,
  toRoomScheduleFormValues,
  validateRoomScheduleForm,
} from '@/utils/room/schedule'

const t = (key: string) => key

function scheduleWith(days: RoomSchedule['days'], overrides: Partial<RoomSchedule> = {}) {
  return {
    timezone: 'Europe/Paris',
    slotMinutes: 60,
    breakMinutes: 0,
    bookableDesks: 4,
    publicBooking: false,
    days,
    ...overrides,
  } satisfies RoomSchedule
}

function formWith(days: RoomSchedule['days'], overrides: Partial<RoomSchedule> = {}) {
  return toRoomScheduleFormValues(scheduleWith(days, overrides))
}

/** Vendredi ouvert de 20:00 à 02:00, avec la première session demandée. */
function overnightFriday(firstSessionAt: string) {
  return formWith({ '5': { opensAt: '20:00', firstSessionAt, closesAt: '02:00' } })
}

/** Erreur de fuseau de la validation, pour un fuseau donné. */
function timezoneError(timezone: string) {
  return validateRoomScheduleForm(formWith({}, { timezone }), t).timezone
}

/** Traduction qui ne connaît qu'un code d'erreur : les autres clés reviennent telles quelles. */
function translateInvalidBody(key: string): string {
  return key === 'rooms.schedule.errors.invalid_body' ? 'Réglages invalides' : key
}

describe('utils/room/schedule.ts', () => {
  describe('form values', () => {
    it('starts closed, in the default time zone, with the desks of the room', () => {
      const form = createDefaultRoomScheduleFormValues({ desksCount: 3 })

      expect(form).toMatchObject({
        timezone: ROOM_DEFAULT_TIMEZONE,
        slotMinutes: '60',
        breakMinutes: '0',
        bookableDesks: '3',
        publicBooking: false,
      })
      expect(Object.values(form.days).every((day) => !day.open)).toBe(true)
      expect(Object.keys(form.days)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    })

    it('falls back to the default form for a room without schedule', () => {
      expect(toRoomScheduleFormValues(null)).toEqual(createDefaultRoomScheduleFormValues())
      expect(toRoomScheduleFormValues(undefined)).toEqual(createDefaultRoomScheduleFormValues())
    })

    it('round-trips a saved schedule, keeping only the open days and the first session set', () => {
      const schedule = scheduleWith(
        {
          '1': { opensAt: '10:00', closesAt: '22:00' },
          '6': { opensAt: '10:00', firstSessionAt: '10:30', closesAt: '01:00' },
        },
        { breakMinutes: 15, publicBooking: true }
      )

      expect(buildRoomSchedule(toRoomScheduleFormValues(schedule))).toEqual(schedule)
    })
  })

  describe('validation', () => {
    it('accepts a valid schedule, including a room with no open day', () => {
      expect(
        hasRoomScheduleFormErrors(
          validateRoomScheduleForm(formWith({ '1': { opensAt: '10:00', closesAt: '22:00' } }), t)
        )
      ).toBe(false)
      expect(hasRoomScheduleFormErrors(validateRoomScheduleForm(formWith({}), t))).toBe(false)
    })

    it('rejects an unknown time zone', () => {
      const form = formWith({}, { timezone: 'Mars/Olympus' })

      expect(validateRoomScheduleForm(form, t).timezone).toBe(
        'rooms.schedule.validation.timezoneInvalid'
      )
    })

    it.each([
      ['slotMinutes', '9', 'slotMinutesInvalid'],
      ['slotMinutes', '241', 'slotMinutesInvalid'],
      ['slotMinutes', '', 'slotMinutesInvalid'],
      ['slotMinutes', '6.5', 'slotMinutesInvalid'],
      ['breakMinutes', '121', 'breakMinutesInvalid'],
      ['breakMinutes', '-1', 'breakMinutesInvalid'],
      ['bookableDesks', '0', 'bookableDesksInvalid'],
      ['bookableDesks', '7', 'bookableDesksInvalid'],
    ] as const)('rejects %s = "%s"', (field, value, message) => {
      const form = formWith({})

      form[field] = value

      expect(validateRoomScheduleForm(form, t)[field]).toBe(`rooms.schedule.validation.${message}`)
    })

    it('accepts the bounds of the numeric fields', () => {
      const form = formWith({}, { slotMinutes: 10, breakMinutes: 120, bookableDesks: 6 })

      expect(hasRoomScheduleFormErrors(validateRoomScheduleForm(form, t))).toBe(false)

      form.slotMinutes = '240'
      form.breakMinutes = '0'
      form.bookableDesks = '1'

      expect(hasRoomScheduleFormErrors(validateRoomScheduleForm(form, t))).toBe(false)
    })

    it('requires the opening and closing times of an open day only', () => {
      const form = formWith({ '1': { opensAt: '10:00', closesAt: '22:00' } })

      form.days['1'].closesAt = ''
      form.days['2'].opensAt = ''

      expect(validateRoomScheduleForm(form, t).days).toEqual({
        '1': 'rooms.schedule.validation.timeRequired',
      })
    })

    it('requires the first session to fall within the opening hours', () => {
      const out = formWith({
        '1': { opensAt: '10:00', firstSessionAt: '22:00', closesAt: '22:00' },
      })
      const before = formWith({
        '1': { opensAt: '10:00', firstSessionAt: '09:00', closesAt: '22:00' },
      })
      const inside = formWith({
        '1': { opensAt: '10:00', firstSessionAt: '10:30', closesAt: '22:00' },
      })

      expect(validateRoomScheduleForm(out, t).days['1']).toBe(
        'rooms.schedule.validation.firstSessionOutOfRange'
      )
      expect(validateRoomScheduleForm(before, t).days['1']).toBe(
        'rooms.schedule.validation.firstSessionOutOfRange'
      )
      expect(validateRoomScheduleForm(inside, t).days['1']).toBeUndefined()
    })

    it('reads a first session after midnight as part of an overnight opening', () => {
      expect(validateRoomScheduleForm(overnightFriday('01:00'), t).days['5']).toBeUndefined()
      expect(validateRoomScheduleForm(overnightFriday('03:00'), t).days['5']).toBe(
        'rooms.schedule.validation.firstSessionOutOfRange'
      )
    })

    it('rejects a closing after midnight that runs past the next opening', () => {
      const form = formWith({
        '6': { opensAt: '10:00', closesAt: '01:00' },
        '7': { opensAt: '00:30', closesAt: '10:00' },
      })

      expect(validateRoomScheduleForm(form, t).days).toEqual({
        '6': 'rooms.schedule.validation.daysOverlap',
      })
    })

    it('accepts back-to-back days and a closed next day', () => {
      const backToBack = formWith({
        '6': { opensAt: '10:00', closesAt: '01:00' },
        '7': { opensAt: '01:00', closesAt: '10:00' },
      })
      const nextClosed = formWith({ '6': { opensAt: '10:00', closesAt: '05:00' } })

      expect(hasRoomScheduleFormErrors(validateRoomScheduleForm(backToBack, t))).toBe(false)
      expect(hasRoomScheduleFormErrors(validateRoomScheduleForm(nextClosed, t))).toBe(false)
    })

    it('checks Sunday against Monday, and a 24 h opening against the next opening', () => {
      const sunday = formWith({
        '7': { opensAt: '10:00', closesAt: '02:00' },
        '1': { opensAt: '01:00', closesAt: '10:00' },
      })
      const fullDay = formWith({
        '2': { opensAt: '10:00', closesAt: '10:00' },
        '3': { opensAt: '09:00', closesAt: '22:00' },
      })

      expect(validateRoomScheduleForm(sunday, t).days['7']).toBe(
        'rooms.schedule.validation.daysOverlap'
      )
      expect(validateRoomScheduleForm(fullDay, t).days['2']).toBe(
        'rooms.schedule.validation.daysOverlap'
      )
    })
  })

  describe('buildRoomSchedule', () => {
    it('converts the text fields to numbers and omits an empty first session', () => {
      const form = formWith({ '3': { opensAt: '09:00', closesAt: '18:00' } })

      form.slotMinutes = '45'
      form.breakMinutes = '15'
      form.bookableDesks = '2'
      form.publicBooking = true

      expect(buildRoomSchedule(form)).toEqual({
        timezone: 'Europe/Paris',
        slotMinutes: 45,
        breakMinutes: 15,
        bookableDesks: 2,
        publicBooking: true,
        days: { '3': { opensAt: '09:00', closesAt: '18:00' } },
      })
    })
  })

  describe('previewRoomSchedule', () => {
    it('lists the slots of each open day with the shared computation', () => {
      const preview = previewRoomSchedule(
        scheduleWith({
          '1': { opensAt: '10:00', closesAt: '13:00' },
          '4': { opensAt: '10:00', firstSessionAt: '10:30', closesAt: '12:30' },
        })
      )

      expect(preview).toEqual([
        { day: '1', times: ['10:00', '11:00', '12:00'], count: 3 },
        { day: '4', times: ['10:30', '11:30'], count: 2 },
      ])
    })

    it('counts every slot but only lists the first ones', () => {
      const [monday] = previewRoomSchedule(
        scheduleWith({ '1': { opensAt: '10:00', closesAt: '22:00' } })
      )

      expect(monday?.count).toBe(12)
      expect(monday?.times).toEqual(['10:00', '11:00', '12:00', '13:00', '14:00', '15:00'])
    })

    it('keeps the slots after midnight on the opening day and honours the break', () => {
      const [saturday] = previewRoomSchedule(
        scheduleWith(
          { '6': { opensAt: '22:00', closesAt: '01:00' } },
          { slotMinutes: 30, breakMinutes: 10 }
        )
      )

      expect(saturday).toEqual({
        day: '6',
        times: ['22:00', '22:40', '23:20', '00:00'],
        count: 4,
      })
    })

    it('is empty for a room with no open day', () => {
      expect(previewRoomSchedule(scheduleWith({}))).toEqual([])
    })
  })

  describe('time zones', () => {
    it('validates IANA names', () => {
      expect(timezoneError('Europe/Paris')).toBeUndefined()
      expect(timezoneError('America/New_York')).toBeUndefined()
      expect(timezoneError('Mars/Olympus')).toBeDefined()
      expect(timezoneError('')).toBeDefined()
    })

    it('always offers the default and the current value, sorted', () => {
      const zones = getRoomScheduleTimezones('Mars/Olympus')

      expect(zones).toContain(ROOM_DEFAULT_TIMEZONE)
      expect(zones).toContain('Mars/Olympus')
      expect(zones).toEqual([...zones].sort((left, right) => left.localeCompare(right)))
      expect(zones.length).toBeGreaterThan(2)
    })
  })

  describe('getRoomScheduleApiError', () => {
    it('translates a known code and falls back to the default message', () => {
      expect(getRoomScheduleApiError('invalid_body', translateInvalidBody)).toBe(
        'Réglages invalides'
      )
      expect(getRoomScheduleApiError('boom', translateInvalidBody)).toBe(
        'rooms.schedule.errors.default'
      )
    })
  })
})
