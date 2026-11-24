/**
 * Joueurs d'une compagnie (lot 7b). Pas de table : un joueur est un e-mail normalisé dans une
 * compagnie, lu sur les pupitres des parties.
 */

/** Nom mis à la place de celui d'un joueur effacé, dans les parties déjà jouées (Q13). */
export const PLAYER_ERASED_NAME = 'Joueur effacé' as const

/** Liste des joueurs : pagination, `limit` au-delà du plafond ramené au plafond. */
export const PLAYER_LIST_DEFAULT_LIMIT = 50
export const PLAYER_LIST_MAX_LIMIT = 200

/** Longueur maximale de la recherche par nom (le nom d'un joueur tient en 100 caractères). */
export const PLAYER_SEARCH_MAX_LENGTH = 100
