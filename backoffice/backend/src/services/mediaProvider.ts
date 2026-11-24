import { z } from 'zod'

import { QUESTION_MEDIA_PROVIDER_DEEZER, type QuestionMediaProvider } from '@quizzup/shared'

/**
 * Client du fournisseur d'extraits audio (Deezer, API publique sans clé). Le serveur ne télécharge
 * jamais l'audio : il lit les métadonnées d'un titre et transmet le lien d'extrait à la salle.
 */

const DEFAULT_BASE_URL = 'https://api.deezer.com'
const REQUEST_TIMEOUT_MS = 5000

/** Titre normalisé. `previewUrl` : lien signé à durée de vie courte, jamais enregistré en base. */
export type ProviderTrack = {
  provider: QuestionMediaProvider
  ref: string
  title: string
  artist: string
  album: string
  coverUrl: string | null
  previewUrl: string | null
  link: string | null
}

/** Fournisseur injoignable ou réponse inexploitable (délai, réseau, statut ≥ 500, JSON invalide). */
export class MediaProviderUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'MediaProviderUnavailableError'
  }
}

/**
 * Référence d'un titre : chiffres seulement. Frontière de confiance, car elle est insérée dans
 * l'URL appelée.
 */
export const providerRefSchema = z.string().regex(/^\d{1,20}$/)

const trackSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  link: z.string().optional(),
  preview: z.string().optional(),
  artist: z.object({ name: z.string() }),
  album: z.object({ title: z.string(), cover_medium: z.string().optional() }),
})

const searchSchema = z.object({ data: z.array(trackSchema) })

const errorSchema = z.object({
  error: z.object({ type: z.string().optional(), code: z.number().optional() }),
})

/** Le lien est transmis tel quel à la salle : seules les URL `https:` absolues passent. */
function toHttpsUrl(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  try {
    return new URL(value).protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

function toProviderTrack(track: z.infer<typeof trackSchema>): ProviderTrack {
  return {
    provider: QUESTION_MEDIA_PROVIDER_DEEZER,
    ref: String(track.id),
    title: track.title,
    artist: track.artist.name,
    album: track.album.title,
    coverUrl: toHttpsUrl(track.album.cover_medium),
    previewUrl: toHttpsUrl(track.preview),
    link: toHttpsUrl(track.link),
  }
}

/** Corps JSON de la réponse ; `null` pour un 404. Toute autre défaillance : fournisseur indisponible. */
async function fetchJson(url: URL): Promise<unknown> {
  let response: Response

  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (error) {
    throw new MediaProviderUnavailableError('media provider request failed', { cause: error })
  }

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new MediaProviderUnavailableError(`media provider answered ${response.status}`)
  }

  try {
    return await response.json()
  } catch (error) {
    throw new MediaProviderUnavailableError('media provider answered invalid JSON', {
      cause: error,
    })
  }
}

function getBaseUrl(): string {
  return (process.env.DEEZER_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

/** Recherche de titres. Les titres sans extrait sont rendus tels quels (`previewUrl: null`). */
export async function searchProviderTracks(query: string, limit: number): Promise<ProviderTrack[]> {
  const url = new URL(`${getBaseUrl()}/search/track`)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))

  const body = await fetchJson(url)
  const parsed = searchSchema.safeParse(body)

  if (!parsed.success) {
    throw new MediaProviderUnavailableError('media provider answered an unexpected search body')
  }

  return parsed.data.data.map(toProviderTrack)
}

/**
 * Un titre, ou `null` s'il est introuvable (référence invalide comprise). Lève
 * `MediaProviderUnavailableError` si le fournisseur ne répond pas correctement.
 */
export async function getProviderTrack(ref: string): Promise<ProviderTrack | null> {
  if (!providerRefSchema.safeParse(ref).success) {
    return null
  }

  const body = await fetchJson(new URL(`${getBaseUrl()}/track/${ref}`))

  if (body === null) {
    return null
  }

  // Un titre inconnu répond 200 avec `{ error: { type: 'DataException', code: 800 } }` ; les autres
  // erreurs (quota dépassé, etc.) sont une indisponibilité, pas un titre introuvable.
  const providerError = errorSchema.safeParse(body)

  if (providerError.success) {
    const { type, code } = providerError.data.error

    if (type === 'DataException' || code === 800) {
      return null
    }

    throw new MediaProviderUnavailableError(`media provider error ${type ?? ''} ${code ?? ''}`)
  }

  const parsed = trackSchema.safeParse(body)

  if (!parsed.success) {
    throw new MediaProviderUnavailableError('media provider answered an unexpected track body')
  }

  return toProviderTrack(parsed.data)
}
