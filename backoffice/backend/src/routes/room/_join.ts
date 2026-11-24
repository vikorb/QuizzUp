import { GAME_STATE_PENDING, GAME_STATE_RUNNING, GAME_STATUS_DELETED } from '@quizzup/shared'

import db from '../../db'

/**
 * Partie courante d'une salle : la partie en cours s'il y en a une, sinon la partie en attente.
 * Les deux peuvent coexister (le groupe suivant s'inscrit pendant que le premier joue) ; l'écran
 * de salle joue d'abord la partie en cours. `kidsMode` : mode enfants de cette partie ;
 * `questionsPerRound` : questions par manche.
 */
export async function findCurrentGameId(
  companyId: number,
  roomId: number
): Promise<{ id: number; kidsMode: boolean; questionsPerRound: number } | null> {
  for (const state of [GAME_STATE_RUNNING, GAME_STATE_PENDING]) {
    const game = await db('games')
      .where('room_id', roomId)
      .where('company_id', companyId)
      .where('state', state)
      .whereNot('status', GAME_STATUS_DELETED)
      .first('id', 'kids_mode', 'questions_per_round')

    if (game) {
      return {
        id: Number(game.id),
        kidsMode: Boolean(game.kids_mode),
        questionsPerRound: Number(game.questions_per_round),
      }
    }
  }

  return null
}
