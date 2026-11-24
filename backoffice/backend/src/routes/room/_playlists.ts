import {
  DEFAULT_QUESTION_KIND,
  QUESTION_AUDIO_EFFECT_NONE,
  QUESTION_MEDIA_TYPE_AUDIO,
} from '@quizzup/shared'
import type { FastifyBaseLogger } from 'fastify'

import {
  getProviderPlaylistTracks,
  isPlayableTrack,
  MediaProviderUnavailableError,
  type ProviderPlaylistTrack,
} from '../../services/mediaProvider'
import type { RoomContentMediaCredit, RoomContentQuestion, RoomContentTheme } from './_content'

/**
 * Questions de blind test tirées d'une playlist du fournisseur d'extraits (conception des
 * playlists, `docs/cadrage/conception-playlists.md`). Leur identifiant est négatif (`-trackId`) :
 * aucune ligne `questions` ne leur correspond.
 */

const PLAYLIST_QUESTION_TEXT = 'Quel est ce titre ?'

/** Leurres par question, pris dans toute la playlist. */
const PLAYLIST_DECOYS = 3

/** Titres jouables distincts au moins pour qu'une playlist donne une question. */
const PLAYLIST_MIN_DRAW_TRACKS = 2

/** Playlists au plus tirées par partie, et thèmes au plus relus par un appel de la route `tracks`. */
export const PLAYLISTS_MAX_PER_GAME = 6

/** Appels de la route `tracks` acceptés par salle et par fenêtre (une reprise par rechargement). */
export const ROOM_TRACKS_RATE_LIMIT_MAX = 6
export const ROOM_TRACKS_RATE_LIMIT_WINDOW_MS = 60_000

/** Lectures de playlists simultanées au plus. */
const PLAYLISTS_MAX_CONCURRENT_REQUESTS = 5

export type PlaylistTheme = { id: number; name: string; playlistRef: string }

/** Thèmes qui portent une playlist, parmi des lignes `themes` déjà filtrées (compagnie, mode enfants). */
export function toPlaylistThemes(
  rows: Array<{ id: number | string; name: string; playlist_ref?: unknown }>
): PlaylistTheme[] {
  return rows.flatMap((row) =>
    typeof row.playlist_ref === 'string'
      ? [{ id: Number(row.id), name: row.name, playlistRef: row.playlist_ref }]
      : []
  )
}

/** Minuscules, sans accents ni espaces superflus : la clé de comparaison des titres. */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/\s+/g, ' ')
    .trim()
}

/** Mélange de Fisher-Yates ; `random` rend un nombre dans [0, 1). */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))

    ;[result[index], result[other]] = [result[other], result[index]]
  }

  return result
}

const toTrackId = (track: ProviderPlaylistTrack): number => -Number(track.ref)

const toAnswer = (track: ProviderPlaylistTrack, isCorrect: boolean) => ({
  id: toTrackId(track),
  text: `${track.titleShort} – ${track.artist}`,
  isCorrect,
})

function toMediaCredit(track: ProviderPlaylistTrack): RoomContentMediaCredit {
  return {
    provider: track.provider,
    title: track.title,
    artist: track.artist,
    coverUrl: track.coverUrl,
    link: track.link,
  }
}

/**
 * Au plus `count` questions « Quel est ce titre ? » tirées parmi les titres jouables de la
 * playlist (lisibles, avec un extrait ; un seul par titre normalisé). Chaque question a trois
 * leurres pris dans toute la liste, même sans extrait, aux titres distincts du bon et entre eux.
 * Moins de 2 titres jouables : aucune question. `random` rend un nombre dans [0, 1). Un titre dont
 * la référence n'est pas un entier sûr est écarté (question et leurre) : son `id` négatif ne
 * correspondrait plus à la référence.
 */
export function buildPlaylistQuestions(
  allTracks: readonly ProviderPlaylistTrack[],
  count: number,
  random: () => number
): RoomContentQuestion[] {
  const tracks = allTracks.filter((track) => Number.isSafeInteger(Number(track.ref)))
  const playable = new Map<string, ProviderPlaylistTrack>()

  for (const track of tracks) {
    const key = normalizeTitle(track.titleShort)

    if (isPlayableTrack(track) && !playable.has(key)) {
      playable.set(key, track)
    }
  }

  if (playable.size < PLAYLIST_MIN_DRAW_TRACKS) {
    return []
  }

  return shuffle([...playable.values()], random)
    .slice(0, count)
    .map((track) => {
      const seen = new Set([normalizeTitle(track.titleShort)])
      const decoys: ProviderPlaylistTrack[] = []

      for (const candidate of shuffle(tracks, random)) {
        const key = normalizeTitle(candidate.titleShort)

        if (decoys.length < PLAYLIST_DECOYS && !seen.has(key)) {
          seen.add(key)
          decoys.push(candidate)
        }
      }

      return {
        id: toTrackId(track),
        text: PLAYLIST_QUESTION_TEXT,
        kind: DEFAULT_QUESTION_KIND,
        mediaType: QUESTION_MEDIA_TYPE_AUDIO,
        mediaUrl: track.previewUrl,
        mediaStartMs: 0,
        audioEffect: QUESTION_AUDIO_EFFECT_NONE,
        mediaCredit: toMediaCredit(track),
        answers: shuffle(
          [toAnswer(track, true), ...decoys.map((decoy) => toAnswer(decoy, false))],
          random
        ),
      }
    })
}

/**
 * Lit les playlists (dédupliquées) : cinq appels simultanés au plus, sans cache (les liens
 * d'extrait expirent). Une playlist introuvable est absente du résultat, seule. Dès la première
 * indisponibilité du fournisseur plus aucun appel n'est lancé (ceux en vol se terminent). Toute
 * autre erreur est un défaut du serveur : elle remonte.
 */
async function readPlaylists(
  refs: string[]
): Promise<{ playlists: Map<string, ProviderPlaylistTrack[]>; unavailable: boolean }> {
  const playlists = new Map<string, ProviderPlaylistTrack[]>()
  const pending = [...new Set(refs)]
  let unavailable = false

  const work = async () => {
    for (let ref = pending.shift(); ref !== undefined && !unavailable; ref = pending.shift()) {
      try {
        const tracks = await getProviderPlaylistTracks(ref)

        if (tracks) {
          playlists.set(ref, tracks)
        }
      } catch (error) {
        if (!(error instanceof MediaProviderUnavailableError)) {
          throw error
        }

        unavailable = true
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PLAYLISTS_MAX_CONCURRENT_REQUESTS, pending.length) }, work)
  )

  return { playlists, unavailable }
}

/**
 * Thèmes de playlist d'une partie : au plus 6 playlists (tirées au hasard s'il y en a plus), `count`
 * questions chacune. Une playlist introuvable, en panne ou trop petite est écartée seule, avec un
 * seul avertissement ; les autres thèmes restent. Triés par identifiant de thème.
 */
export async function drawPlaylistThemes(
  themes: PlaylistTheme[],
  count: number,
  log: Pick<FastifyBaseLogger, 'warn'>,
  random: () => number = Math.random
): Promise<RoomContentTheme[]> {
  const chosen = shuffle(themes, random).slice(0, PLAYLISTS_MAX_PER_GAME)
  const { playlists } = await readPlaylists(chosen.map((theme) => theme.playlistRef))
  const drawn = chosen.map((theme) => ({
    id: theme.id,
    name: theme.name,
    questions: buildPlaylistQuestions(playlists.get(theme.playlistRef) ?? [], count, random),
  }))
  const dropped = drawn.filter((theme) => theme.questions.length === 0)

  if (dropped.length > 0) {
    log.warn(
      { dropped: dropped.length, themeIds: dropped.map((theme) => theme.id) },
      'playlist themes dropped from the room content'
    )
  }

  return drawn.filter((theme) => theme.questions.length > 0).sort((a, b) => a.id - b.id)
}

export type PlaylistTrackItem = {
  ref: string
  mediaUrl: string
  mediaCredit: RoomContentMediaCredit
}

/**
 * Liens d'extrait à jour des titres demandés, retrouvés seulement dans les playlists de `themes`
 * (celles que la partie peut recevoir). Un titre hors de ces playlists ou sans extrait est
 * absent. `unavailable` : le fournisseur n'a pas répondu à toutes les lectures.
 */
export async function findPlaylistTracks(
  themes: PlaylistTheme[],
  refs: string[]
): Promise<{ items: PlaylistTrackItem[]; unavailable: boolean }> {
  const { playlists, unavailable } = await readPlaylists(themes.map((theme) => theme.playlistRef))
  const wanted = new Set(refs)
  const found = new Map<string, PlaylistTrackItem>()

  for (const track of [...playlists.values()].flat()) {
    if (wanted.has(track.ref) && isPlayableTrack(track) && track.previewUrl) {
      found.set(track.ref, {
        ref: track.ref,
        mediaUrl: track.previewUrl,
        mediaCredit: toMediaCredit(track),
      })
    }
  }

  return { items: refs.flatMap((ref) => found.get(ref) ?? []), unavailable }
}
