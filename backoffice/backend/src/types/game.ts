import type { GameFormat, GameLocale, GameState, GameStatus, MiniGame } from '@quizzup/shared'

/** 2e joueur facultatif d'un pupitre. */
export type GameSecondPlayerRow = {
  displayName: string
  /** `null` si absent, ou masqué pour le rôle `user` (voir `hasEmail`). */
  email: string | null
  hasEmail: boolean
  consentAt: string | null
  /** Accepte de recevoir les offres du centre (jamais vrai sans email). */
  marketingConsent: boolean
}

export type GameParticipantRow = {
  id: number
  podium: number
  displayName: string
  /** `null` si absent, ou masqué pour le rôle `user` (voir `hasEmail`). */
  email: string | null
  hasEmail: boolean
  consentAt: string | null
  /** Accepte de recevoir les offres du centre (jamais vrai sans email). */
  marketingConsent: boolean
  secondPlayer: GameSecondPlayerRow | null
  /** Score du pupitre, partagé par ses joueurs. */
  score: number
}

/**
 * Lien d'inscription d'une partie en attente. `url` est relative si `PUBLIC_APP_URL` est vide ;
 * `qrSvg` (QR code de `url`) vaut alors `null`.
 */
export type GameJoin = {
  url: string
  qrSvg: string | null
  expiresAt: string
}

export type GameRow = {
  id: number
  companyId: number
  roomId: number
  roomName?: string
  /** `null` pour une réservation faite par l'API (la partie porte alors une clé d'API). */
  adminId: number | null
  /** Format choisi à la création ; `null` pour une partie d'avant les formats (« Personnalisé »). */
  format: GameFormat | null
  roundsCount: number
  questionsPerRound: number
  /** Mini-jeux choisis au lancement, `null` = tous. */
  miniGames: MiniGame[] | null
  seed: number
  state: GameState
  startedAt: string | null
  finishedAt: string | null
  /** Début prévu d'une session programmée, `null` pour une partie immédiate. */
  scheduledAt: string | null
  scheduledEndAt: string | null
  /** Renseigné si et seulement si `state` vaut `cancelled`. */
  cancelledAt: string | null
  /** Effectif annoncé à la réservation. */
  playersCount: number | null
  /** Référence du système de réservation du client. */
  externalRef: string | null
  locale: GameLocale | null
  status: GameStatus
  createdAt: string
  updatedAt: string | null
  /** Joueurs nommés (1er et 2e joueurs de chaque pupitre) ; liste des parties seulement. */
  participantsCount?: number
  /** `finished_at − started_at` d'une partie terminée, sinon `null` ; liste des parties seulement. */
  durationSeconds?: number | null
  /** Meilleur score d'une partie terminée, sinon `null` ; liste des parties seulement. */
  topScore?: number | null
  participants?: GameParticipantRow[]
  /** Lien d'inscription ouvert (partie en attente seulement), sinon `null` ; voir `addGameJoin`. */
  join?: GameJoin | null
  /** Demandes d'inscription à valider ; voir `addGameJoin`. */
  pendingRegistrationsCount?: number
}
