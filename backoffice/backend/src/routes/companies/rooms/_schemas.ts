import { z } from 'zod'

import {
  GAME_PODIUMS,
  ROOM_MIN_DESKS,
  ROOM_SCHEDULE_DAYS,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
  ROOM_STATUS_INACTIVE,
  SESSION_MAX_BREAK_MINUTES,
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
  timeToMinutes,
  type RoomSchedule,
  type RoomScheduleDay,
  type RoomScheduleDayKey,
} from '@quizzup/shared'

export const ROOM_NAME_MAX_LENGTH = 255
/** Garde-fou sur la taille de la configuration matérielle stockée en JSON. */
export const ROOM_CONFIG_MAX_LENGTH = 20_000

export const roomsParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

export const roomParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  roomId: z.coerce.number().int().positive(),
})

const roomNameSchema = z.string().trim().min(1).max(ROOM_NAME_MAX_LENGTH)

/** `desksCount` (nombre de pupitres de la salle), s'il est présent : entier de 1 à 6. */
function hasValidDesksCount(config: Record<string, unknown>): boolean {
  const { desksCount } = config

  return (
    desksCount === undefined ||
    (Number.isInteger(desksCount) &&
      (desksCount as number) >= ROOM_MIN_DESKS &&
      (desksCount as number) <= GAME_PODIUMS)
  )
}

export const roomConfigSchema = z
  .record(z.string(), z.unknown())
  .refine((config) => JSON.stringify(config).length <= ROOM_CONFIG_MAX_LENGTH, {
    message: 'room_config_too_large',
  })
  .refine(hasValidDesksCount, { message: 'room_desks_count_invalid', path: ['desksCount'] })

export const createRoomSchema = z.object({
  name: roomNameSchema,
  config: roomConfigSchema.optional(),
})

export const updateRoomSchema = z
  .object({
    name: roomNameSchema.optional(),
    config: roomConfigSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.config !== undefined, {
    message: 'empty_body',
  })

export const updateRoomStatusSchema = z.object({
  status: z.union([
    z.literal(ROOM_STATUS_INACTIVE),
    z.literal(ROOM_STATUS_ACTIVE),
    z.literal(ROOM_STATUS_DELETED),
  ]),
})

/** Identifiant de connexion du PC de la salle (US-ROOM-02). */
export const createRoomAccountSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(255)
    .regex(/^[\w.-]+$/),
  password: z.string().min(8).max(100),
})

const DAY_MINUTES = 1440

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const timeSchema = z.string().regex(TIME_PATTERN, 'schedule_time_invalid')

/**
 * Avec Zod 4, un `regex` en échec n'arrête pas les `refine` du parent : ils ne convertissent que
 * des heures valides (l'erreur `schedule_time_invalid` du champ suffit sinon).
 */
function hasValidTimes({ opensAt, closesAt, firstSessionAt }: RoomScheduleDay): boolean {
  return [opensAt, closesAt, firstSessionAt].every(
    (time) => time === undefined || TIME_PATTERN.test(time)
  )
}

/**
 * Nom IANA normalisé par `Intl` (`europe/paris` → `Europe/Paris`), `null` s'il est refusé. `Intl`
 * lève une `RangeError` pour un nom inconnu mais accepte les décalages fixes (`+01:00`) et les
 * abréviations (`EST`, `CET`) : ils sont refusés ici, seul `UTC` est admis sans `/`.
 */
function canonicalTimeZone(timeZone: string): string | null {
  if (/^[+-]/.test(timeZone) || (!timeZone.includes('/') && timeZone.toUpperCase() !== 'UTC')) {
    return null
  }

  try {
    return new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

/** Fermeture en minutes depuis l'ouverture du jour : `closesAt` ≤ `opensAt` veut dire « le lendemain ». */
function closingMinutes({ opensAt, closesAt }: RoomScheduleDay): number {
  const closes = timeToMinutes(closesAt)

  return closes <= timeToMinutes(opensAt) ? closes + DAY_MINUTES : closes
}

const roomScheduleDaySchema = z
  .object({
    opensAt: timeSchema,
    firstSessionAt: timeSchema.optional(),
    closesAt: timeSchema,
  })
  .refine(
    (day) => {
      if (day.firstSessionAt === undefined || !hasValidTimes(day)) {
        return true
      }

      const first = timeToMinutes(day.firstSessionAt)

      // Avant l'ouverture dans la journée : c'est après minuit, le lendemain.
      return (
        (first < timeToMinutes(day.opensAt) ? first + DAY_MINUTES : first) < closingMinutes(day)
      )
    },
    { message: 'schedule_first_session_out_of_range', path: ['firstSessionAt'] }
  )

/** Deux jours consécutifs (le dimanche précède le lundi) ne se chevauchent pas. */
function hasOverlappingDays(days: Partial<Record<RoomScheduleDayKey, RoomScheduleDay>>): boolean {
  return ROOM_SCHEDULE_DAYS.some((key, index) => {
    const day = days[key]
    const next = days[ROOM_SCHEDULE_DAYS[(index + 1) % ROOM_SCHEDULE_DAYS.length]!]

    return (
      day !== undefined &&
      next !== undefined &&
      hasValidTimes(day) &&
      hasValidTimes(next) &&
      closingMinutes(day) > DAY_MINUTES + timeToMinutes(next.opensAt)
    )
  })
}

export const roomScheduleSchema = z.object({
  timezone: z.string().transform((timeZone, ctx) => {
    const canonical = canonicalTimeZone(timeZone)

    if (canonical === null) {
      ctx.issues.push({ code: 'custom', message: 'schedule_timezone_invalid', input: timeZone })

      return z.NEVER
    }

    return canonical
  }),
  slotMinutes: z.number().int().min(SESSION_MIN_MINUTES).max(SESSION_MAX_MINUTES),
  breakMinutes: z.number().int().min(0).max(SESSION_MAX_BREAK_MINUTES).default(0),
  bookableDesks: z.number().int().min(ROOM_MIN_DESKS).max(GAME_PODIUMS),
  publicBooking: z.boolean(),
  days: z
    .partialRecord(z.enum(ROOM_SCHEDULE_DAYS), roomScheduleDaySchema)
    .refine((days) => !hasOverlappingDays(days), { message: 'schedule_days_overlap' }),
}) satisfies z.ZodType<RoomSchedule, unknown>

/** `schedule: null` désactive les créneaux : la salle n'est plus réservable. */
export const updateRoomScheduleSchema = z.object({ schedule: roomScheduleSchema.nullable() })
