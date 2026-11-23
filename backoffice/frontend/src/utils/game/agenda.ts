import {
  computeRoomSlots,
  GAME_SLOT_STATES,
  GAME_STATE_CANCELLED,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_DELETED,
  type GameState,
  ROOM_DEFAULT_TIMEZONE,
  type RoomSchedule,
  type RoomSlot,
  SESSION_OPEN_EARLY_MINUTES,
  zonedLocalToUtc,
} from '@quizzup/shared'

import type { Game } from '@/types/game'
import { type GameStateTone, getGameStateLabelKey, getGameStateTone } from '@/utils/game/state'

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

/** « non lancée » n'est pas un état stocké : une session `scheduled` dont le créneau est fini. */
type AgendaStateKind = GameState | 'not_launched'

export type AgendaEntry =
  | { kind: 'slot'; key: string; startMs: number; slot: RoomSlot }
  | { kind: 'game'; key: string; startMs: number; game: Game }

/** Fuseau d'une salle : le sien, sinon celui par défaut (une salle sans créneaux n'en a pas). */
export function getRoomTimezone(schedule: RoomSchedule | null | undefined): string {
  return schedule?.timezone ?? ROOM_DEFAULT_TIMEZONE
}

/** Jour du calendrier (`YYYY-MM-DD`) d'un instant dans un fuseau. */
export function getLocalDate(instantMs: number, timeZone: string): string {
  const parts = new Map<string, string>()

  for (const { type, value } of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instantMs))) {
    parts.set(type, value)
  }

  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`
}

/** Valeur d'un `<input type="date">` : vide tant que la saisie n'est pas un jour complet. */
export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Début d'un jour local : 00:00, ou 01:00 si minuit n'existe pas ce jour-là (changement d'heure). */
function getLocalDayStart(date: string, timeZone: string): Date {
  return (
    zonedLocalToUtc(`${date}T00:00`, timeZone) ??
    zonedLocalToUtc(`${date}T01:00`, timeZone) ??
    new Date(`${date}T00:00:00Z`)
  )
}

/**
 * Intervalle `[from, to)` à demander au serveur pour afficher un jour : le jour local, et le suivant
 * en entier, car les créneaux après minuit appartiennent au jour d'ouverture et leurs sessions
 * doivent compter comme « occupées ».
 */
export function getAgendaWindow(date: string, timeZone: string): { from: string; to: string } {
  return {
    from: getLocalDayStart(date, timeZone).toISOString(),
    to: getLocalDayStart(shiftDate(date, 2), timeZone).toISOString(),
  }
}

function getGameStartMs(game: Game): number {
  return Date.parse(game.scheduledAt ?? game.startedAt ?? game.createdAt)
}

/** Seules les sessions programmées bloquent un créneau ; une partie immédiate n'en occupe aucun. */
function isBusy(game: Game): game is Game & { scheduledAt: string; scheduledEndAt: string } {
  return (
    Boolean(game.scheduledAt && game.scheduledEndAt) &&
    game.status !== GAME_STATUS_DELETED &&
    (GAME_SLOT_STATES as readonly string[]).includes(game.state)
  )
}

/**
 * Liste chronologique d'un jour : les créneaux libres de la grille (fonction partagée, la même que
 * celle du serveur) et les sessions du jour, parties immédiates comprises, à leur heure.
 * Une session annulée a libéré son créneau : elle n'apparaît plus.
 */
export function buildAgendaTimeline(input: {
  schedule: RoomSchedule | null
  date: string
  now: Date
  games: Game[]
}): AgendaEntry[] {
  const { schedule, date, now, games } = input
  const timeZone = getRoomTimezone(schedule)
  const dayStartMs = getLocalDayStart(date, timeZone).getTime()
  const nextDayStartMs = getLocalDayStart(shiftDate(date, 1), timeZone).getTime()

  const slots = schedule
    ? computeRoomSlots({
        schedule,
        date,
        now,
        busy: games.filter(isBusy).map(({ scheduledAt, scheduledEndAt }) => ({
          startsAt: scheduledAt,
          endsAt: scheduledEndAt,
        })),
      })
    : []

  const entries: AgendaEntry[] = [
    ...slots.map((slot): AgendaEntry => ({
      kind: 'slot',
      key: `slot-${slot.startsAt}`,
      startMs: Date.parse(slot.startsAt),
      slot,
    })),
    ...games
      .filter((game) => game.state !== GAME_STATE_CANCELLED && game.status !== GAME_STATUS_DELETED)
      .map((game): AgendaEntry => ({
        kind: 'game',
        key: `game-${game.id}`,
        startMs: getGameStartMs(game),
        game,
      }))
      .filter((entry) => entry.startMs >= dayStartMs && entry.startMs < nextDayStartMs),
  ]

  // À heure égale, la session passe avant un créneau libre (qui ne peut pas la chevaucher).
  return entries.sort(
    (left, right) =>
      left.startMs - right.startMs || Number(right.kind === 'game') - Number(left.kind === 'game')
  )
}

export function getAgendaStateKind(game: Game, nowMs: number): AgendaStateKind {
  const endMs = game.scheduledEndAt ? Date.parse(game.scheduledEndAt) : Number.NaN

  return game.state === GAME_STATE_SCHEDULED && endMs <= nowMs ? 'not_launched' : game.state
}

export function getAgendaStateLabelKey(kind: AgendaStateKind): string {
  return kind === 'not_launched' ? 'agenda.state.notLaunched' : getGameStateLabelKey(kind)
}

export function getAgendaStateTone(kind: AgendaStateKind): GameStateTone {
  return kind === 'not_launched' ? 'warn' : getGameStateTone(kind)
}

/** Même règle que le serveur : dès 60 min avant le début, sans borne de fin. */
export function canOpenScheduledGame(game: Game, nowMs: number): boolean {
  return (
    game.state === GAME_STATE_SCHEDULED &&
    Boolean(game.scheduledAt) &&
    Date.parse(game.scheduledAt ?? '') - nowMs <= SESSION_OPEN_EARLY_MINUTES * MINUTE_MS
  )
}

export function canCancelScheduledGame(game: Game): boolean {
  return game.state === GAME_STATE_SCHEDULED
}

/** Heure d'un instant dans le fuseau de la salle, sur 24 h (`14:00`), quelle que soit la langue. */
export function formatAgendaTime(value: string | number, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))
}
