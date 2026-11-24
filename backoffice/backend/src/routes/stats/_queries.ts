import { GAME_STATE_ABORTED, GAME_STATE_FINISHED, GAME_STATUS_DELETED } from '@quizzup/shared'

import db from '../../db'
import { GAME_DATE_SQL } from '../games/_shared'

/** Créneaux renvoyés : les plus chargés d'abord, pas toute la grille jour × heure. */
const BUSIEST_SLOTS_LIMIT = 10

export type StatsFilters = {
  companyId: number
  roomId?: number
  from: Date
  to: Date
  timeZone: string
}

export type CompanyStats = {
  sessions: {
    finished: number
    aborted: number
    /** Arrêtées / (terminées + arrêtées), de 0 à 1 ; `null` sans aucune session. */
    abandonRate: number | null
    /** Durée réelle médiane d'une session terminée, en secondes ; `null` si aucune. */
    medianDurationSeconds: number | null
    byRoom: Array<{ roomId: number; roomName: string; finished: number; aborted: number }>
  }
  players: {
    total: number
    /** Joueurs par session terminée, une décimale ; `null` sans session terminée. */
    averagePerSession: number | null
    withEmail: number
    emailRate: number | null
    withMarketingConsent: number
    marketingConsentRate: number | null
    /** E-mails distincts (normalisés) vus sur la période, et ceux vus dans au moins 2 sessions. */
    distinctEmails: number
    returningEmails: number
  }
  /** `weekday` : 1 = lundi à 7 = dimanche ; `hour` : 0 à 23, dans le fuseau demandé. */
  busiestSlots: Array<{ weekday: number; hour: number; sessions: number }>
}

function rate(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 10_000) / 10_000
}

/**
 * Parties terminées ou arrêtées de la période, en CTE `g` : tous les agrégats partent de cette
 * même sélection, donc d'une même définition de la période (date de la partie, comme l'historique).
 * Une partie arrêtée avant d'avoir démarré (`started_at` vide) n'est pas un abandon : exclue.
 */
function periodGames({ companyId, roomId, from, to }: StatsFilters) {
  const games = db('games')
    .select('games.id', 'games.room_id', 'games.state', 'games.started_at', 'games.finished_at')
    .select(db.raw(`${GAME_DATE_SQL} as played_at`))
    .where('games.company_id', companyId)
    .whereNot('games.status', GAME_STATUS_DELETED)
    .whereRaw('(games.state = ? or (games.state = ? and games.started_at is not null))', [
      GAME_STATE_FINISHED,
      GAME_STATE_ABORTED,
    ])
    .whereRaw(`${GAME_DATE_SQL} >= ?`, [from.toISOString()])
    .whereRaw(`${GAME_DATE_SQL} < ?`, [to.toISOString()])

  if (roomId) {
    games.where('games.room_id', roomId)
  }

  return games
}

let timeZoneNames: Promise<Set<string>> | undefined

/**
 * Noms de fuseau que PostgreSQL sait lire (`pg_timezone_names`), en minuscules, chargés une seule
 * fois : ce sont les seuls que `at time zone` accepte sans erreur, `Intl` en connaît d'autres.
 */
export function loadTimeZoneNames(): Promise<Set<string>> {
  timeZoneNames ??= db('pg_timezone_names')
    .select('name')
    .then((rows) => new Set(rows.map((row) => String(row.name).toLowerCase())))
    .catch((error: unknown) => {
      timeZoneNames = undefined

      throw error
    })

  return timeZoneNames
}

/** Agrégats d'exploitation d'une compagnie, calculés en SQL. Aucune donnée d'un joueur n'en sort. */
export async function loadCompanyStats(filters: StatsFilters): Promise<CompanyStats> {
  const withGames = () => db.with('g', periodGames(filters)).from('g')

  const [rooms, duration, slots, players, returning] = await Promise.all([
    withGames()
      .join('rooms', 'rooms.id', 'g.room_id')
      .select('rooms.id as roomId', 'rooms.name as roomName')
      .select(
        db.raw('count(*) filter (where g.state = ?)::int as finished', [GAME_STATE_FINISHED]),
        db.raw('count(*) filter (where g.state = ?)::int as aborted', [GAME_STATE_ABORTED])
      )
      .groupBy('rooms.id', 'rooms.name')
      .orderBy('rooms.name')
      .orderBy('rooms.id'),

    withGames()
      .where('g.state', GAME_STATE_FINISHED)
      .whereNotNull('g.started_at')
      .whereNotNull('g.finished_at')
      .first(
        db.raw(
          'percentile_cont(0.5) within group (order by extract(epoch from g.finished_at - g.started_at)) as median'
        )
      ),

    // `at time zone` sur un `timestamptz` donne l'heure du mur du fuseau, changements d'heure compris.
    withGames()
      .where('g.state', GAME_STATE_FINISHED)
      .select(
        db.raw('extract(isodow from g.played_at at time zone ?)::int as weekday', [
          filters.timeZone,
        ]),
        db.raw('extract(hour from g.played_at at time zone ?)::int as hour', [filters.timeZone]),
        db.raw('count(*)::int as sessions')
      )
      .groupByRaw('1, 2')
      .orderBy('sessions', 'desc')
      .orderBy('weekday')
      .orderBy('hour')
      .limit(BUSIEST_SLOTS_LIMIT),

    // Un pupitre = un premier joueur, plus un second joueur s'il est nommé.
    withGames()
      .join('game_participants as p', 'p.game_id', 'g.id')
      .where('g.state', GAME_STATE_FINISHED)
      .first(
        db.raw('(count(*) + count(p.second_display_name))::int as total'),
        db.raw('(count(p.email) + count(p.second_email))::int as "withEmail"'),
        db.raw(
          '(count(p.marketing_consent_at) + count(p.second_marketing_consent_at))::int as "withMarketingConsent"'
        )
      ),

    // Une session compte une fois par e-mail, même si l'adresse figure sur deux pupitres.
    db
      .with('g', periodGames(filters))
      .with(
        'seen',
        db.raw(
          `SELECT p.game_id, lower(btrim(p.email)) AS email
             FROM game_participants p JOIN g ON g.id = p.game_id AND g.state = ?
            WHERE p.email IS NOT NULL
           UNION ALL
           SELECT p.game_id, lower(btrim(p.second_email))
             FROM game_participants p JOIN g ON g.id = p.game_id AND g.state = ?
            WHERE p.second_email IS NOT NULL`,
          [GAME_STATE_FINISHED, GAME_STATE_FINISHED]
        )
      )
      .with(
        'per_email',
        db.raw('SELECT email, count(DISTINCT game_id) AS sessions FROM seen GROUP BY email')
      )
      .from('per_email')
      .first(
        db.raw('count(*)::int as "distinctEmails"'),
        db.raw('(count(*) filter (where sessions >= 2))::int as "returningEmails"')
      ),
  ])

  const byRoom = rooms.map((room) => ({
    roomId: Number(room.roomId),
    roomName: String(room.roomName),
    finished: Number(room.finished),
    aborted: Number(room.aborted),
  }))
  const finished = byRoom.reduce((sum, room) => sum + room.finished, 0)
  const aborted = byRoom.reduce((sum, room) => sum + room.aborted, 0)
  const total = Number(players?.total ?? 0)
  const withEmail = Number(players?.withEmail ?? 0)
  const withMarketingConsent = Number(players?.withMarketingConsent ?? 0)
  const median = duration?.median

  return {
    sessions: {
      finished,
      aborted,
      abandonRate: rate(aborted, finished + aborted),
      medianDurationSeconds:
        median === null || median === undefined ? null : Math.round(Number(median)),
      byRoom,
    },
    players: {
      total,
      averagePerSession: finished === 0 ? null : Math.round((total / finished) * 10) / 10,
      withEmail,
      emailRate: rate(withEmail, total),
      withMarketingConsent,
      marketingConsentRate: rate(withMarketingConsent, total),
      distinctEmails: Number(returning?.distinctEmails ?? 0),
      returningEmails: Number(returning?.returningEmails ?? 0),
    },
    busiestSlots: slots.map((slot) => ({
      weekday: Number(slot.weekday),
      hour: Number(slot.hour),
      sessions: Number(slot.sessions),
    })),
  }
}
