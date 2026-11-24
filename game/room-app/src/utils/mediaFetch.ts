import { authHeaders, getApiBase, getRoomToken } from '@/utils/auth'

/**
 * Le média est-il servi par l'API de la salle ? Seul lui reçoit le jeton de la salle : un chemin
 * relatif et une URL de l'origine de l'API, oui ; toute autre origine (extrait d'un domaine tiers)
 * ou URL illisible, non.
 */
export function isApiMediaUrl(url: string, apiBase: string): boolean {
  try {
    return new URL(url, apiBase).origin === new URL(apiBase).origin
  } catch {
    return false
  }
}

/**
 * Téléchargement d'un extrait. Frontière de sécurité : le jeton de la salle ne part jamais vers un
 * tiers, qui reçoit une requête sans en-tête ni cookie (son préflight n'accepte que `Range`).
 */
export function fetchRoomMedia(url: string): Promise<Response> {
  if (!isApiMediaUrl(url, getApiBase())) {
    return fetch(url, { credentials: 'omit' })
  }
  const token = getRoomToken()
  return fetch(url, token ? { headers: authHeaders(token) } : {})
}
