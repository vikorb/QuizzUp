import type { GameParticipant } from '@/types/game'

/** Une ligne du classement : seulement ce qui s'imprime (jamais d'email). */
type GameRankingRow = {
  id: number
  rank: number
  names: string[]
  score: number
}

/**
 * Classement par score décroissant. Les égalités partagent le rang et le suivant est sauté
 * (1, 2, 2, 4). À score égal, l'ordre d'affichage suit le pupitre.
 */
export function rankGameParticipants(participants: GameParticipant[]): GameRankingRow[] {
  const sorted = [...participants].sort(
    (left, right) => right.score - left.score || left.podium - right.podium
  )

  return sorted.map((participant) => ({
    id: participant.id,
    rank: sorted.findIndex((other) => other.score === participant.score) + 1,
    names: [participant.displayName, participant.secondPlayer?.displayName].filter(
      (name): name is string => Boolean(name)
    ),
    score: participant.score,
  }))
}
