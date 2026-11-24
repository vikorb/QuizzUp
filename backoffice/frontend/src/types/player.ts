/** Codes d'erreur des routes `/companies/:companyId/players*`, plus ceux du client (réseau, JSON). */
export type PlayersApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'api_unreachable'
  | 'invalid_json'
  | 'invalid_params'
  | 'invalid_body'
  | 'player_not_found'
  | 'server_error'

/** Un joueur de la liste : `email` vaut `null` pour le rôle `user`. */
export type Player = {
  email: string | null
  displayName: string
  /** Parties terminées et non supprimées ; 0 sans partie jouée. */
  sessions: number
  /** `null` sans partie jouée. */
  lastPlayedAt: string | null
  /** `null` sans partie jouée. */
  bestScore: number | null
  marketingConsent: boolean
}

export type PlayersList = {
  players: Player[]
  /** Joueurs qui répondent à la recherche, toutes pages confondues. */
  total: number
  /** Joueurs sans adresse des parties terminées : on ne peut que les compter. */
  anonymousPlayers: number
}

/** Recherche sur le nom et page de `GET /companies/:companyId/players`. */
export type PlayersQuery = {
  search?: string
  limit?: number
  offset?: number
}

export type PlayersResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number | null; error: PlayersApiErrorCode }
