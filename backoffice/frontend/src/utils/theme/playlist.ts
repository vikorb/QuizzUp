// Même forme que `providerRefSchema` du serveur (`services/mediaProvider.ts`) : le lien saisi est
// réduit à cet identifiant avant l'envoi, le serveur le revérifie.
const PLAYLIST_REF_PATTERN = /^\d{1,20}$/
const PLAYLIST_LINK_PATTERN = /\/playlist\/(\d{1,20})(?!\d)/

/**
 * Identifiant de playlist d'un lien Deezer (`https://www.deezer.com/fr/playlist/123456`) ou d'un
 * identifiant seul (`123456`). `null` si rien d'exploitable : les liens courts (`link.deezer.com`)
 * ne portent pas l'identifiant.
 */
export function extractPlaylistRef(input: string): string | null {
  const value = input.trim()

  if (PLAYLIST_REF_PATTERN.test(value)) {
    return value
  }

  return PLAYLIST_LINK_PATTERN.exec(value)?.[1] ?? null
}
