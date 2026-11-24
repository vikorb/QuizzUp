import type { PlayersApiErrorCode } from '@/types/player'

const PLAYERS_API_ERROR_CODES: PlayersApiErrorCode[] = [
  'missing_token',
  'unauthorized',
  'forbidden',
  'api_unreachable',
  'invalid_json',
  'invalid_params',
  'invalid_body',
  'player_not_found',
  'server_error',
]

function isPlayersApiErrorCode(value: unknown): value is PlayersApiErrorCode {
  return typeof value === 'string' && PLAYERS_API_ERROR_CODES.includes(value as PlayersApiErrorCode)
}

/** Code d'erreur d'une réponse de l'API des joueurs, `null` s'il est inconnu. */
export function readPlayersApiError(payload: unknown): PlayersApiErrorCode | null {
  const error = (payload as { error?: unknown } | null)?.error

  return isPlayersApiErrorCode(error) ? error : null
}

/** `player_not_found` → `players.errors.playerNotFound` : clé i18n d'un code d'erreur. */
export function getPlayersErrorKey(code: string | null | undefined): string {
  const known = isPlayersApiErrorCode(code) ? code : 'server_error'

  return `players.errors.${known.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())}`
}
