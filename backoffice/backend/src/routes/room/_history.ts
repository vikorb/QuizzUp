import type { Knex } from 'knex'
import { z } from 'zod'

import {
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  GAME_STATE_FINISHED,
  GAME_STATUS_DELETED,
  MINI_GAMES,
} from '@quizzup/shared'

import db from '../../db'
import { isReadableByCompany } from './_content'

/**
 * Manches jouées, envoyées par la salle à la fin de la partie : numéro, mini-jeu, thème et
 * identifiants des questions posées. Un numéro ou une question ne figure qu'une fois par manche.
 */
export const roomRoundsSchema = z
  .array(
    z
      .object({
        position: z.number().int().min(1).max(GAME_MAX_ROUNDS),
        miniGame: z.enum(MINI_GAMES),
        themeId: z.number().int().positive().nullable(),
        questionIds: z
          .array(z.number().int().positive())
          .max(GAME_MAX_QUESTIONS_PER_ROUND)
          .refine((ids) => new Set(ids).size === ids.length),
      })
      .strict()
  )
  .max(GAME_MAX_ROUNDS)
  .refine((rounds) => new Set(rounds.map((round) => round.position)).size === rounds.length)

export type RoomRounds = z.infer<typeof roomRoundsSchema>

type ScopedRow = { scope: string; company_id: number | string | null }

/** Tous les identifiants existent et sont lisibles par la compagnie (global ou propre à elle). */
async function allReadable(table: 'themes' | 'questions', ids: number[], companyId: number) {
  if (ids.length === 0) {
    return true
  }

  const rows = (await db(table)
    .whereIn('id', ids)
    .select('id', 'scope', 'company_id')) as ScopedRow[]

  return rows.length === ids.length && rows.every((row) => isReadableByCompany(row, companyId))
}

/**
 * Les manches tiennent dans la partie (`position` au plus égale à son nombre de manches), et leurs
 * thèmes et questions appartiennent à la compagnie ou au contenu global. Seuls la portée et
 * l'existence comptent, pas l'état : un thème ou une question supprimé ou en brouillon depuis le
 * tirage est accepté, car la file hors ligne de la salle peut envoyer une fin de partie après une
 * suppression, et l'historique doit garder ce qui a été joué.
 */
export async function areRoundsAcceptable(
  companyId: number,
  roundsCount: number,
  rounds: RoomRounds
): Promise<boolean> {
  if (rounds.some((round) => round.position > roundsCount)) {
    return false
  }

  const themeIds = [...new Set(rounds.flatMap((round) => round.themeId ?? []))]
  const questionIds = [...new Set(rounds.flatMap((round) => round.questionIds))]

  return (
    (await allReadable('themes', themeIds, companyId)) &&
    (await allReadable('questions', questionIds, companyId))
  )
}

/** Écrit les manches dans la transaction de fin de partie (`questions` = tableau d'identifiants). */
export async function saveGameRounds(trx: Knex.Transaction, gameId: number, rounds: RoomRounds) {
  if (rounds.length === 0) {
    return
  }

  await trx('game_rounds').insert(
    rounds.map((round) => ({
      game_id: gameId,
      position: round.position,
      mini_game: round.miniGame,
      theme_id: round.themeId,
      questions: JSON.stringify(round.questionIds),
    }))
  )
}

/** Nombre de questions déjà vues renvoyées à la salle au plus (les plus récentes). */
export const AVOID_QUESTIONS_MAX = 2000

/**
 * Questions que les joueurs de la partie ont déjà vues : celles des manches des parties terminées
 * de la compagnie où figure l'un de leurs e-mails (premier ou second joueur, normalisé comme la
 * purge : `lower(btrim(email))`). Les joueurs sans e-mail ne sont pas connus, un e-mail purgé non
 * plus. Les plus récentes d'abord (date de la dernière partie, puis identifiant croissant), donc
 * deux appels sur les mêmes données donnent la même liste ; `AVOID_QUESTIONS_MAX` au plus.
 * La salle s'en sert pour poser ces questions en dernier : voir `avoidQuestionIds` du moteur.
 */
export async function findAvoidQuestionIds(companyId: number, gameId: number): Promise<number[]> {
  const result = (await db.raw(
    `WITH players AS (
       SELECT lower(btrim(email)) AS email_key
       FROM game_participants
       WHERE game_id = :gameId AND email IS NOT NULL
       UNION
       SELECT lower(btrim(second_email))
       FROM game_participants
       WHERE game_id = :gameId AND second_email IS NOT NULL
     ),
     seen AS (
       SELECT
         CAST(q.id AS bigint) AS question_id,
         max(COALESCE(g.finished_at, g.started_at, g.created_at)) AS seen_at
       FROM games g
       JOIN game_participants gp ON gp.game_id = g.id
       JOIN game_rounds r ON r.game_id = g.id
       CROSS JOIN LATERAL jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(r.questions) = 'array' THEN r.questions ELSE CAST('[]' AS jsonb) END
       ) AS q(id)
       WHERE g.company_id = :companyId
         AND g.state = :finished
         AND g.status <> :deleted
         AND (
           lower(btrim(gp.email)) IN (SELECT email_key FROM players)
           OR lower(btrim(gp.second_email)) IN (SELECT email_key FROM players)
         )
       GROUP BY q.id
     )
     SELECT question_id FROM seen ORDER BY seen_at DESC, question_id ASC LIMIT :limit`,
    {
      companyId,
      gameId,
      finished: GAME_STATE_FINISHED,
      deleted: GAME_STATUS_DELETED,
      limit: AVOID_QUESTIONS_MAX,
    }
  )) as { rows: Array<{ question_id: number }> }

  return result.rows.map((row) => row.question_id)
}
