import { SESSION_HORIZON_DAYS, type RoomSchedule, type RoomScheduleDayKey } from './index.js'

/**
 * Créneaux réservables d'une salle (lot 13). Fonction pure, sans dépendance : seulement `Date` et
 * `Intl`. Le backend (disponibilités, validation d'une réservation) et l'agenda du backoffice
 * s'appuient sur le même calcul, pour ne jamais afficher un créneau que le serveur refuserait.
 */

const MINUTE_MS = 60_000
const DAY_MINUTES = 1440

/** Une session déjà prise (état dans `GAME_SLOT_STATES`), intervalle semi-ouvert `[début, fin)`. */
export type BusyInterval = {
  startsAt: Date | string
  endsAt: Date | string
}

export type RoomSlot = {
  /** Début en UTC, ISO 8601 (`2027-03-28T08:00:00.000Z`). */
  startsAt: string
  /** Début + durée du créneau, en minutes réelles. */
  endsAt: string
  /** Heure locale de la salle, `HH:MM`. */
  localTime: string
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)

  if (!formatter) {
    // `h23` : minuit s'écrit 00 et non 24 selon les moteurs. Lève une RangeError si le fuseau est inconnu.
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(timeZone, formatter)
  }

  return formatter
}

/** Heure murale d'un instant dans un fuseau, lue comme si elle était en UTC (ms). */
function wallClockAsUtc(instantMs: number, timeZone: string): number {
  const parts: Record<string, number> = {}

  for (const { type, value } of getFormatter(timeZone).formatToParts(new Date(instantMs))) {
    if (type !== 'literal') {
      parts[type] = Number(value)
    }
  }

  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

/**
 * Convertit une heure locale (`YYYY-MM-DDTHH:MM`, sans fuseau) en instant UTC dans `timeZone`.
 *
 * - Heure inexistante (saut de l'heure d'été) : `null`.
 * - Heure ambiguë (retour à l'heure d'hiver) : le premier passage, donc l'instant le plus tôt.
 *
 * On ne sait pas lire un décalage directement : on essaie les deux décalages qui encadrent
 * l'heure demandée et on ne garde que ceux dont le rendu local redonne exactement cette heure.
 * Les échantillons sont pris à ± 24 h (et non 12 h) pour couvrir aussi les fuseaux à +13 / +14 h,
 * où l'instant cherché est à plus de 12 h de l'heure lue comme UTC.
 */
export function zonedLocalToUtc(localDateTime: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localDateTime)

  if (!match) {
    throw new RangeError(`Date locale invalide : ${localDateTime}`)
  }

  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const candidates = new Set<number>()

  for (const shift of [-DAY_MINUTES, DAY_MINUTES]) {
    const sample = guess + shift * MINUTE_MS
    const offset = wallClockAsUtc(sample, timeZone) - sample
    const candidate = guess - offset

    if (wallClockAsUtc(candidate, timeZone) === guess) {
      candidates.add(candidate)
    }
  }

  return candidates.size === 0 ? null : new Date(Math.min(...candidates))
}

/** `HH:MM` → minutes depuis minuit. */
function toMinutes(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)

  if (!match) {
    throw new RangeError(`Heure invalide : ${time}`)
  }

  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * Créneaux d'une salle pour une date locale.
 *
 * - `date` : `YYYY-MM-DD`, jour du calendrier de la salle.
 * - Un créneau après minuit appartient au jour d'ouverture (`closesAt` ≤ `opensAt` : ferme le lendemain).
 * - Sont écartés : début ≤ `now`, début au-delà de `now` + `SESSION_HORIZON_DAYS`, heure inexistante
 *   (changement d'heure) et, si `busy` est fourni, chevauchement d'une session occupée.
 * - Sans `busy`, on obtient la grille « valide » : une réservation n'est acceptée que si son début
 *   y figure (c'est la base de données qui tranche le créneau déjà pris, via `slot_taken`).
 *
 * Lève une `RangeError` pour une date, une heure, un fuseau ou une durée invalides : les entrées
 * sont validées en amont (Zod), ce garde-fou évite surtout une boucle infinie.
 */
export function computeRoomSlots(input: {
  schedule: RoomSchedule
  date: string
  now: Date
  busy?: readonly BusyInterval[]
}): RoomSlot[] {
  const { schedule, date, now, busy = [] } = input
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)

  if (!dateMatch) {
    throw new RangeError(`Date invalide : ${date}`)
  }

  const { slotMinutes, breakMinutes } = schedule

  if (
    !Number.isInteger(slotMinutes) ||
    slotMinutes < 1 ||
    !Number.isInteger(breakMinutes) ||
    breakMinutes < 0
  ) {
    throw new RangeError('Durée de créneau ou de pause invalide')
  }

  const midnight = Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))
  // Le jour ISO se lit sur la date du calendrier, sans fuseau (getUTCDay : 0 = dimanche).
  const isoDay = String(new Date(midnight).getUTCDay() || 7) as RoomScheduleDayKey
  const day = schedule.days[isoDay]

  if (!day) {
    return []
  }

  const opens = toMinutes(day.opensAt)
  let closes = toMinutes(day.closesAt)
  let first = toMinutes(day.firstSessionAt ?? day.opensAt)

  if (closes <= opens) {
    closes += DAY_MINUTES
  }

  if (first < opens) {
    first += DAY_MINUTES
  }

  const earliest = now.getTime()
  const latest = earliest + SESSION_HORIZON_DAYS * DAY_MINUTES * MINUTE_MS
  const busyMs = busy.map(({ startsAt, endsAt }) => [
    new Date(startsAt).getTime(),
    new Date(endsAt).getTime(),
  ])
  const slots: RoomSlot[] = []

  // Contrôle en minutes d'horloge locale : un jour de changement d'heure, la durée réelle de la
  // plage d'ouverture varie d'une heure, ce qui est accepté.
  for (let t = first; t + slotMinutes <= closes; t += slotMinutes + breakMinutes) {
    const localIso = new Date(midnight + t * MINUTE_MS).toISOString()
    const start = zonedLocalToUtc(localIso.slice(0, 16), schedule.timezone)

    if (!start) {
      continue
    }

    const startMs = start.getTime()
    const endMs = startMs + slotMinutes * MINUTE_MS

    if (startMs <= earliest || startMs > latest) {
      continue
    }

    if (busyMs.some(([busyStart, busyEnd]) => startMs < busyEnd && endMs > busyStart)) {
      continue
    }

    slots.push({
      startsAt: start.toISOString(),
      endsAt: new Date(endMs).toISOString(),
      localTime: localIso.slice(11, 16),
    })
  }

  return slots
}
