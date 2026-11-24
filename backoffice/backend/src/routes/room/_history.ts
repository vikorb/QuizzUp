import type { Knex } from 'knex'
import { z } from 'zod'

import { GAME_MAX_QUESTIONS_PER_ROUND, GAME_MAX_ROUNDS, MINI_GAMES } from '@quizzup/shared'

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

/** Les thèmes et les questions des manches appartiennent à la compagnie ou au contenu global. */
export async function areRoundsReadable(companyId: number, rounds: RoomRounds): Promise<boolean> {
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
