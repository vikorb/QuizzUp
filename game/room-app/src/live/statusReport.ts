import type { GameState } from '@quizzup/game-engine'
import type { RoomScreen, RoomStatusReport } from '@quizzup/shared'

/** Écran de la salle (nom de route) → `RoomScreen`. Une route inconnue ou la connexion : `other`. */
const SCREEN_BY_ROUTE: Readonly<Record<string, RoomScreen>> = {
  launch: 'launch',
  lobby: 'lobby',
  play: 'play',
  setup: 'setup',
  'setup-lights': 'setup',
}

export type RoomStatusInput = {
  routeName: string | symbol | null | undefined
  /** Partie du moteur en cours dans cette page, `null` hors partie. */
  state: GameState | null
  /** Partie du backoffice retenue sur ce PC (`id` et graine), `null` si aucune. */
  backofficeGame: { id: number; seed: number | null } | null
  paused: boolean
  audioReady: boolean
}

/**
 * Rapport d'état publié au backoffice (`POST /room/status`). Aucune donnée de joueur : ni nom ni
 * e-mail, seulement des numéros de pupitre et des scores. Le `gameId` n'est publié que si la
 * partie du moteur est bien celle du backoffice (même graine).
 */
export function buildRoomStatusReport(input: RoomStatusInput): RoomStatusReport {
  const { state, backofficeGame } = input
  const round = state?.rounds.at(-1)
  const phase = state?.phase
  const hasQuestion = phase?.name === 'question' || phase?.name === 'reveal'

  return {
    screen: (typeof input.routeName === 'string' && SCREEN_BY_ROUTE[input.routeName]) || 'other',
    gameId: state && backofficeGame?.seed === state.setup.seed ? backofficeGame.id : null,
    phase: phase?.name ?? null,
    round: round?.position ?? null,
    questionIndex: hasQuestion ? phase.questionIndex : null,
    miniGame: round?.miniGame ?? null,
    paused: state !== null && input.paused,
    scores: (state?.scores ?? [])
      .flatMap((line) => {
        const podium = state?.setup.participants.find(
          (participant) => participant.id === line.participantId
        )?.podium
        return podium === undefined ? [] : [{ podium, score: line.score }]
      })
      .sort((first, second) => first.podium - second.podium),
    audioReady: input.audioReady,
  }
}
