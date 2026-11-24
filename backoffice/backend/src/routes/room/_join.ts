import { GAME_STATE_PENDING, GAME_STATE_RUNNING, GAME_STATUS_DELETED } from '@quizzup/shared'
import db from '../../db'

/**
 * Partie courante d'une salle : la partie en cours s'il y en a une, sinon la partie en attente.
 * Les deux peuvent coexister (le groupe suivant s'inscrit pendant que le premier joue) ; l'écran
 * de salle joue d'abord la partie en cours.
 */
export async function findCurrentGameId(companyId: number, roomId: number): Promise<number | null> {
  for (const state of [GAME_STATE_RUNNING, GAME_STATE_PENDING]) {
    const game = await db('games')
      .where('room_id', roomId)
      .where('company_id', companyId)
      .where('state', state)
      .whereNot('status', GAME_STATUS_DELETED)
      .first('id')

    if (game) {
      return Number(game.id)
    }
  }

  return null
}
