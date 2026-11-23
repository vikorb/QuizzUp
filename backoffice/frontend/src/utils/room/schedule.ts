import {
  computeRoomSlots,
  GAME_PODIUMS,
  getRoomDesksCount,
  ROOM_DEFAULT_TIMEZONE,
  ROOM_MIN_DESKS,
  ROOM_SCHEDULE_DAYS,
  type RoomSchedule,
  type RoomScheduleDay,
  type RoomScheduleDayKey,
  SESSION_DEFAULT_MINUTES,
  SESSION_MAX_BREAK_MINUTES,
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
} from '@quizzup/shared'

import type { TranslateFn } from '@/types'
import type {
  RoomConfig,
  RoomScheduleDayFormValues,
  RoomScheduleFieldErrors,
  RoomScheduleFormValues,
} from '@/types/room'

const DAY_MINUTES = 1440
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const INTEGER_PATTERN = /^\d+$/

/** Aperçu : une semaine type en plein hiver (pas de changement d'heure), calculée à une date fixe. */
const PREVIEW_NOW = new Date('2030-01-01T00:00:00.000Z')
const PREVIEW_MONDAY_UTC = Date.UTC(2030, 0, 7)
/** Au-delà, l'aperçu s'arrête sur « … » : une salle ouverte 12 h en créneaux de 10 min en aligne 72. */
const ROOM_SCHEDULE_PREVIEW_MAX_SLOTS = 6

export const ROOM_SCHEDULE_NUMBER_LIMITS = {
  slotMinutes: { min: SESSION_MIN_MINUTES, max: SESSION_MAX_MINUTES },
  breakMinutes: { min: 0, max: SESSION_MAX_BREAK_MINUTES },
  bookableDesks: { min: ROOM_MIN_DESKS, max: GAME_PODIUMS },
} as const

function createClosedDay(): RoomScheduleDayFormValues {
  return { open: false, opensAt: '10:00', firstSessionAt: '', closesAt: '22:00' }
}

export function createDefaultRoomScheduleFormValues(config?: RoomConfig): RoomScheduleFormValues {
  const days = {} as RoomScheduleFormValues['days']

  for (const key of ROOM_SCHEDULE_DAYS) {
    days[key] = createClosedDay()
  }

  return {
    timezone: ROOM_DEFAULT_TIMEZONE,
    slotMinutes: String(SESSION_DEFAULT_MINUTES),
    breakMinutes: '0',
    bookableDesks: String(getRoomDesksCount(config)),
    publicBooking: false,
    days,
  }
}

/** Réglages enregistrés → valeurs du formulaire ; `null` : valeurs par défaut (jours fermés). */
export function toRoomScheduleFormValues(
  schedule: RoomSchedule | null | undefined,
  config?: RoomConfig
): RoomScheduleFormValues {
  const form = createDefaultRoomScheduleFormValues(config)

  if (!schedule) {
    return form
  }

  form.timezone = schedule.timezone
  form.slotMinutes = String(schedule.slotMinutes)
  form.breakMinutes = String(schedule.breakMinutes)
  form.bookableDesks = String(schedule.bookableDesks)
  form.publicBooking = schedule.publicBooking

  for (const key of ROOM_SCHEDULE_DAYS) {
    const day = schedule.days[key]

    if (day) {
      form.days[key] = {
        open: true,
        opensAt: day.opensAt,
        firstSessionAt: day.firstSessionAt ?? '',
        closesAt: day.closesAt,
      }
    }
  }

  return form
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat('en', { timeZone: timezone })

    return true
  } catch {
    return false
  }
}

/** Fuseaux proposés : ceux du navigateur, plus la valeur courante (même hors liste). */
export function getRoomScheduleTimezones(current: string): string[] {
  // `Intl.supportedValuesOf` (ES2022) n'est pas dans la `lib` du projet : on le type ici.
  const intl = Intl as { supportedValuesOf?: (key: 'timeZone') => string[] }
  const supported = intl.supportedValuesOf?.('timeZone') ?? []
  const zones = new Set<string>([ROOM_DEFAULT_TIMEZONE, ...supported])

  if (current) {
    zones.add(current)
  }

  return [...zones].sort((left, right) => left.localeCompare(right))
}

function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

/** Fermeture en minutes depuis l'ouverture du jour ; `closesAt` ≤ `opensAt` : le lendemain. */
function getCloseMinutes(day: RoomScheduleDayFormValues): number {
  const opens = toMinutes(day.opensAt)
  const closes = toMinutes(day.closesAt)

  return closes <= opens ? closes + DAY_MINUTES : closes
}

function isInRange(value: string, { min, max }: { min: number; max: number }): boolean {
  if (!INTEGER_PATTERN.test(value)) {
    return false
  }

  const number = Number(value)

  return number >= min && number <= max
}

function validateDay(day: RoomScheduleDayFormValues, t: TranslateFn): string | undefined {
  if (!TIME_PATTERN.test(day.opensAt) || !TIME_PATTERN.test(day.closesAt)) {
    return t('rooms.schedule.validation.timeRequired')
  }

  if (day.firstSessionAt === '') {
    return undefined
  }

  if (!TIME_PATTERN.test(day.firstSessionAt)) {
    return t('rooms.schedule.validation.timeRequired')
  }

  const opens = toMinutes(day.opensAt)
  let first = toMinutes(day.firstSessionAt)

  if (first < opens) {
    first += DAY_MINUTES
  }

  return first >= getCloseMinutes(day)
    ? t('rooms.schedule.validation.firstSessionOutOfRange')
    : undefined
}

/**
 * Mêmes règles que le serveur (conception, §1) : fuseau valide, durée, pause et pupitres dans leurs
 * bornes, première session dans la plage d'ouverture, deux jours consécutifs sans chevauchement
 * (la fermeture après minuit ne dépasse pas l'ouverture du lendemain ; le dimanche précède le lundi).
 */
export function validateRoomScheduleForm(
  form: RoomScheduleFormValues,
  t: TranslateFn
): RoomScheduleFieldErrors {
  const errors: RoomScheduleFieldErrors = { days: {} }
  const { slotMinutes, breakMinutes, bookableDesks } = ROOM_SCHEDULE_NUMBER_LIMITS

  if (!isValidTimezone(form.timezone)) {
    errors.timezone = t('rooms.schedule.validation.timezoneInvalid')
  }

  if (!isInRange(form.slotMinutes, slotMinutes)) {
    errors.slotMinutes = t('rooms.schedule.validation.slotMinutesInvalid')
  }

  if (!isInRange(form.breakMinutes, breakMinutes)) {
    errors.breakMinutes = t('rooms.schedule.validation.breakMinutesInvalid')
  }

  if (!isInRange(form.bookableDesks, bookableDesks)) {
    errors.bookableDesks = t('rooms.schedule.validation.bookableDesksInvalid')
  }

  for (const key of ROOM_SCHEDULE_DAYS) {
    const day = form.days[key]

    if (day.open) {
      const error = validateDay(day, t)

      if (error) {
        errors.days[key] = error
      }
    }
  }

  // Les chevauchements ne se testent que sur des horaires lisibles.
  ROOM_SCHEDULE_DAYS.forEach((key, index) => {
    const day = form.days[key]
    const next = form.days[ROOM_SCHEDULE_DAYS[(index + 1) % ROOM_SCHEDULE_DAYS.length] ?? key]

    if (!day.open || !next.open || errors.days[key]) {
      return
    }

    if (!TIME_PATTERN.test(next.opensAt)) {
      return
    }

    const overflow = getCloseMinutes(day) - DAY_MINUTES

    if (overflow > toMinutes(next.opensAt)) {
      errors.days[key] = t('rooms.schedule.validation.daysOverlap')
    }
  })

  return errors
}

export function hasRoomScheduleFormErrors(errors: RoomScheduleFieldErrors): boolean {
  return (
    Boolean(errors.timezone || errors.slotMinutes || errors.breakMinutes || errors.bookableDesks) ||
    Object.values(errors.days).some(Boolean)
  )
}

/** Valeurs du formulaire (déjà validées) → corps de la requête. */
export function buildRoomSchedule(form: RoomScheduleFormValues): RoomSchedule {
  const days: RoomSchedule['days'] = {}

  for (const key of ROOM_SCHEDULE_DAYS) {
    const day = form.days[key]

    if (day.open) {
      const payloadDay: RoomScheduleDay = { opensAt: day.opensAt, closesAt: day.closesAt }

      if (day.firstSessionAt !== '') {
        payloadDay.firstSessionAt = day.firstSessionAt
      }

      days[key] = payloadDay
    }
  }

  return {
    timezone: form.timezone,
    slotMinutes: Number(form.slotMinutes),
    breakMinutes: Number(form.breakMinutes),
    bookableDesks: Number(form.bookableDesks),
    publicBooking: form.publicBooking,
    days,
  }
}

type RoomSchedulePreviewDay = {
  day: RoomScheduleDayKey
  /** Heures locales des premiers créneaux. */
  times: string[]
  /** Nombre total de créneaux du jour. */
  count: number
}

/** Créneaux de chaque jour ouvert, calculés par la fonction partagée (celle du serveur). */
export function previewRoomSchedule(schedule: RoomSchedule): RoomSchedulePreviewDay[] {
  const preview: RoomSchedulePreviewDay[] = []

  ROOM_SCHEDULE_DAYS.forEach((key, index) => {
    if (!schedule.days[key]) {
      return
    }

    const date = new Date(PREVIEW_MONDAY_UTC + index * DAY_MINUTES * 60_000)
    const slots = computeRoomSlots({
      schedule,
      date: date.toISOString().slice(0, 10),
      now: PREVIEW_NOW,
    })

    preview.push({
      day: key,
      times: slots.slice(0, ROOM_SCHEDULE_PREVIEW_MAX_SLOTS).map((slot) => slot.localTime),
      count: slots.length,
    })
  })

  return preview
}

/** Traduction d'un code d'erreur du serveur ; code inconnu : message par défaut. */
export function getRoomScheduleApiError(errorCode: string, t: TranslateFn): string {
  const key = `rooms.schedule.errors.${errorCode}`
  const translated = t(key)

  return translated === key ? t('rooms.schedule.errors.default') : translated
}
