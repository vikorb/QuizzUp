import type { GameEvent, GamePhase } from '@quizzup/game-engine'
import {
  GAME_PODIUMS,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAMES,
  type MiniGame,
} from '@quizzup/shared'

import {
  ANNOUNCED_ROUNDS_MAX,
  ANSWER_CORRECT_VARIANTS,
  ANSWER_WRONG_VARIANTS,
} from '@/audio/announcements'

/**
 * Mini-jeux dont le moteur émet `answer_correct` : la bonne réponse y est dite à cet événement.
 * Les autres n'émettent que `answer_locked` puis `question_ended` : elle y est dite à la fin de la
 * question (un test rejoue le moteur réel pour vérifier cette liste).
 */
export const MINI_GAMES_ANSWERING_BY_EVENT: readonly MiniGame[] = [
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAME_FLASH_BLIND_TEST,
]

/** Raison de `game_ended` quand la partie s'arrête faute de contenu jouable. */
const GAME_ENDED_NO_CONTENT = 'no_content' satisfies Extract<
  GamePhase,
  { name: 'finished' }
>['reason']

/** Ce que l'écran de salle sait et que l'événement seul ne dit pas. */
export type AnnouncementContext = {
  /** Mini-jeu de la manche en cours. */
  miniGame: MiniGame
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
 *
 * Règles :
 * - La bonne réponse est dite une seule fois par question : à `answer_correct` pour les mini-jeux
 *   de `MINI_GAMES_ANSWERING_BY_EVENT`, à `question_ended` (avec gagnants) pour les autres.
 * - Blind test : l'extrait reprend aussitôt après une erreur, la voix ne dit donc jamais « raté ».
 *   Elle ne parle qu'à la fin de la question : bonne réponse (la musique s'arrête) ou personne n'a
 *   trouvé (`question_ended` sans gagnant, non passée). Les annonces de manche et de mini-jeu sont
 *   dites avant la première question.
 * - La première manche n'est pas numérotée : `game_started` et `round_started` tombent dans le même
 *   lot, on dit « la partie commence » puis le nom du mini-jeu.
 * - Fin de partie sans contenu jouable ou à zéro point : rien à dire.
 */
export function announcementForEvent(event: GameEvent, context: AnnouncementContext): string[] {
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
          : Number.isInteger(position) && position >= 2 && position <= ANNOUNCED_ROUNDS_MAX
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
      return [variantId('answer.correct', ANSWER_CORRECT_VARIANTS, context.variant)]
    }
    case 'answer_wrong': {
      return context.miniGame === MINI_GAME_FLASH_BLIND_TEST
        ? []
        : [variantId('answer.wrong', ANSWER_WRONG_VARIANTS, context.variant)]
    }
    case 'question_ended': {
      // Une question passée par le personnel n'est ni gagnée ni « perdue » par les joueurs.
      if (!Array.isArray(payload.winnerIds) || payload.skipped === true) {
        return []
      }
      if (payload.winnerIds.length === 0) {
        return ['question.lost']
      }
      return MINI_GAMES_ANSWERING_BY_EVENT.includes(context.miniGame)
        ? []
        : [variantId('answer.correct', ANSWER_CORRECT_VARIANTS, context.variant)]
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
      if (payload.reason === GAME_ENDED_NO_CONTENT || bestScore(payload.scores) === 0) {
        return []
      }
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

/** Variante `1..count` : modulo positif sur un entier (un compteur négatif ou décimal reste valide). */
function variantId(prefix: string, count: number, variant: number): string {
  const index = Number.isFinite(variant) ? Math.floor(variant) : 0
  return `${prefix}.${(((index % count) + count) % count) + 1}`
}

/** Meilleur score de `game_ended.scores` ; 0 si la liste est absente ou vide. */
function bestScore(scores: unknown): number {
  return Array.isArray(scores)
    ? Math.max(0, ...scores.map((line: { score?: unknown }) => Number(line?.score) || 0))
    : 0
}

function deskAnnouncement(prefix: string, participantId: unknown, context: AnnouncementContext) {
  const podium = typeof participantId === 'number' ? context.podiumOf(participantId) : undefined
  return podium !== undefined && Number.isInteger(podium) && podium >= 1 && podium <= GAME_PODIUMS
    ? [`${prefix}.${podium}`]
    : []
}
