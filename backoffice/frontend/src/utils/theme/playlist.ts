// Même forme que `providerRefSchema` du serveur (`services/mediaProvider.ts`) : le lien saisi est
// réduit à cet identifiant avant l'envoi, le serveur le revérifie.
const PLAYLIST_REF_PATTERN = /^\d{1,20}$/
// Les chiffres doivent finir le segment : `/playlist/123abc` n'est pas la playlist 123.
const PLAYLIST_PATH_PATTERN = /\/playlist\/(\d{1,20})(?=[/?#]|$)/

// ponytail: ni la conception ni le serveur ne listent d'hôtes ; `deezer.com` et ses sous-domaines
// couvrent `www.` et `api.`. Les liens courts de partage ne portent pas l'identifiant.
function isDeezerHost(hostname: string): boolean {
  return hostname === 'deezer.com' || hostname.endsWith('.deezer.com')
}

/**
 * Identifiant de playlist d'un lien Deezer (`https://www.deezer.com/fr/playlist/123456`) ou d'un
 * identifiant seul (`123456`). `null` si rien d'exploitable.
 */
export function extractPlaylistRef(input: string): string | null {
  const value = input.trim()

  if (PLAYLIST_REF_PATTERN.test(value)) {
    return value
  }

  let url: URL

  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (!['http:', 'https:'].includes(url.protocol) || !isDeezerHost(url.hostname)) {
    return null
  }

  return PLAYLIST_PATH_PATTERN.exec(url.pathname)?.[1] ?? null
}
