import type { GameEvent } from '@quizzup/game-engine'
import { GAME_PODIUMS, MINI_GAMES, type MiniGame } from '@quizzup/shared'

import {
  ANNOUNCED_ROUNDS_MAX,
  ANSWER_CORRECT_VARIANTS,
  ANSWER_WRONG_VARIANTS,
} from '@/audio/announcements'

/** Ce que l'écran de salle sait et que l'événement seul ne dit pas. */
export type AnnouncementContext = {
  /** Vrai tant qu'un palier de blind test est en cours : on ne dit rien, pour ne pas masquer l'extrait. */
  inBlindTestStage: boolean
  /** Nombre de manches de la partie (pour « Dernière manche »). */
  roundsCount: number
  /** Pupitre (1 à `GAME_PODIUMS`) d'un participant, ou `undefined` s'il est inconnu. */
  podiumOf: (participantId: number) => number | undefined
  /** Compteur croissant qui fait tourner les variantes (« Bonne réponse », « Exactement »…). */
  variant: number
}

/**
 * Annonces à dire, dans l'ordre, pour un événement du moteur (liste vide : rien à dire). Les
 * annonces de pause (`game.paused`, `game.resumed`) et de sortie (`session.exit`) ne viennent pas
 * du moteur : l'écran de salle les dit directement.
 */
export function announcementForEvent(event: GameEvent, context: AnnouncementContext): string[] {
  if (context.inBlindTestStage) {
    return []
  }
  const { payload } = event

  switch (event.type) {
    case 'game_started': {
      return ['game.start']
    }
    case 'round_started': {
      const position = Number(payload.position)
      const round =
        context.roundsCount > 1 && position === context.roundsCount
          ? 'round.last'
          : position >= 1 && position <= ANNOUNCED_ROUNDS_MAX
            ? `round.${position}`
            : null
      const miniGame = MINI_GAMES.includes(payload.miniGame as MiniGame)
        ? [`minigame.${String(payload.miniGame)}`]
        : []
      return [...(round ? [round] : []), ...miniGame]
    }
    case 'round_chooser_selected': {
      return deskAnnouncement('chooser.desk', payload.participantId, context)
    }
    case 'answer_correct': {
      return [`answer.correct.${(context.variant % ANSWER_CORRECT_VARIANTS) + 1}`]
    }
    case 'answer_wrong': {
      return [`answer.wrong.${(context.variant % ANSWER_WRONG_VARIANTS) + 1}`]
    }
    case 'question_ended': {
      const winners = Array.isArray(payload.winnerIds) ? payload.winnerIds : []
      // Une question passée par le personnel n'est pas « perdue » par les joueurs.
      return winners.length === 0 && payload.skipped !== true ? ['question.lost'] : []
    }
    case 'bets_closed': {
      return ['bets.closed']
    }
    case 'points_stolen': {
      return ['points.stolen']
    }
    case 'player_eliminated': {
      return ['player.eliminated']
    }
    case 'round_ended': {
      return ['round.end']
    }
    case 'game_ended': {
      const winners = Array.isArray(payload.winnerIds) ? payload.winnerIds : []
      return winners.length > 1
        ? ['game.tie']
        : deskAnnouncement('game.winner.desk', winners[0], context)
    }
    default: {
      return []
    }
  }
}

function deskAnnouncement(prefix: string, participantId: unknown, context: AnnouncementContext) {
  const podium = typeof participantId === 'number' ? context.podiumOf(participantId) : undefined
  return podium !== undefined && Number.isInteger(podium) && podium >= 1 && podium <= GAME_PODIUMS
    ? [`${prefix}.${podium}`]
    : []
}
