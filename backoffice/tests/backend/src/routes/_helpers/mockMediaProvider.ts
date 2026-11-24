import { vi } from 'vitest'

/**
 * Faux fournisseur d'extraits (Deezer) : `globalThis.fetch` est remplacé, aucun appel réseau réel.
 * À défaire avec `vi.unstubAllGlobals()` après chaque test.
 */

export const PROVIDER_ERROR_NOT_FOUND = {
  error: { type: 'DataException', message: 'no data', code: 800 },
}

/** Titre tel que l'API du fournisseur le renvoie. */
export function providerTrack(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Titre ${id}`,
    link: `https://www.deezer.com/track/${id}`,
    preview: `https://cdn.test/preview/${id}.mp3?hdnea=exp=1`,
    readable: true,
    artist: { name: `Artiste ${id}` },
    album: { title: `Album ${id}`, cover_medium: `https://cdn.test/cover/${id}.jpg` },
    ...overrides,
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type ProviderHandler = (url: URL) => Response | Promise<Response>

export function stubProviderFetch(handler: ProviderHandler) {
  const fetchMock = vi.fn(async (input: URL | string, _init?: RequestInit) =>
    handler(new URL(String(input)))
  )

  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

/** Réponses selon l'identifiant demandé (`/track/<id>`) : titre, objet d'erreur ou `Response`. */
export function stubProviderTracks(tracks: Record<string, unknown>) {
  return stubProviderFetch((url) => {
    const body = tracks[url.pathname.split('/').pop() ?? '']

    return body instanceof Response ? body : jsonResponse(body ?? PROVIDER_ERROR_NOT_FOUND)
  })
}
