import type { FastifyBaseLogger } from 'fastify'

import {
  ANSWER_STATUS_ACTIVE,
  DEFAULT_QUESTION_KIND,
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  QUESTION_AUDIO_EFFECT_NONE,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPE_VIDEO,
  QUESTION_STATUS_ACTIVE,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  type QuestionAudioEffect,
} from '@quizzup/shared'

import db from '../../db'
import {
  getProviderTrack,
  MediaProviderUnavailableError,
  type ProviderTrack,
} from '../../services/mediaProvider'
import { drawPlaylistThemes, toPlaylistThemes } from './_playlists'

/** Forme attendue par le moteur de jeu (`EngineTheme` de `@quizzup/game-engine`). */
export type RoomContentAnswer = { id: number; text: string; isCorrect: boolean }

/** Extrait fourni par un fournisseur d'extraits : de quoi l'afficher à l'écran. */
export type RoomContentMediaCredit = Pick<
  ProviderTrack,
  'provider' | 'title' | 'artist' | 'coverUrl' | 'link'
>

export type RoomContentQuestion = {
  id: number
  text: string
  /** Type de question : `qcm`, `true_false` ou `estimate`. */
  kind: string
  mediaType: string
  /**
   * Audio importé : chemin relatif à l'API, à préfixer par son URL de base. Audio d'un
   * fournisseur d'extraits : URL absolue `https://…` à jour. Image / vidéo : lien.
   */
  mediaUrl: string | null
  mediaStartMs: number
  /** Effet joué sur l'extrait (`none` hors question audio). */
  audioEffect: QuestionAudioEffect
  /** Renseigné pour un extrait de fournisseur, `null` pour toutes les autres questions. */
  mediaCredit: RoomContentMediaCredit | null
  answers: RoomContentAnswer[]
}

export type RoomContentTheme = { id: number; name: string; questions: RoomContentQuestion[] }

type ScopedRow = { scope: string; company_id: number | string | null }

/** Contenu jouable par une compagnie : global, ou propre à la compagnie. */
export function isReadableByCompany(row: ScopedRow, companyId: number): boolean {
  return (
    row.scope === THEME_SCOPE_GLOBAL ||
    (row.scope === THEME_SCOPE_COMPANY && Number(row.company_id) === companyId)
  )
}

export function roomMediaUrl(questionId: number): string {
  return `/room/questions/${questionId}/media`
}

type MediaRow = {
  id: number | string
  type_media: string
  media_key: unknown
  media_url: unknown
  media_provider: unknown
  media_provider_ref: unknown
}

/** Référence du titre si l'extrait de la question vient d'un fournisseur (et non d'un fichier). */
function getProviderRef(row: MediaRow): string | null {
  return row.type_media === QUESTION_MEDIA_TYPE_AUDIO &&
    !row.media_key &&
    row.media_provider &&
    typeof row.media_provider_ref === 'string'
    ? row.media_provider_ref
    : null
}

/**
 * URL du média jouable, `null` sans média, ou `undefined` si la question n'est pas jouable :
 * un audio sans fichier uploadé ni extrait de fournisseur, ou une image / vidéo sans lien. Le
 * lien d'un extrait de fournisseur n'est pas stable : il est résolu à part.
 */
function resolvePlayableMediaUrl(row: MediaRow): string | null | undefined {
  switch (row.type_media) {
    case QUESTION_MEDIA_TYPE_NONE: {
      return null
    }
    case QUESTION_MEDIA_TYPE_AUDIO: {
      return row.media_key ? roomMediaUrl(Number(row.id)) : undefined
    }
    case QUESTION_MEDIA_TYPE_IMAGE:
    case QUESTION_MEDIA_TYPE_VIDEO: {
      return typeof row.media_url === 'string' && row.media_url.trim() !== ''
        ? row.media_url
        : undefined
    }
    default: {
      return undefined
    }
  }
}

/** Appels simultanés au plus vers le fournisseur d'extraits. */
const PROVIDER_MAX_CONCURRENT_REQUESTS = 5

/** Références au plus citées dans l'avertissement d'un chargement. */
const LOG_MAX_REFS = 20

/**
 * Titres des extraits de fournisseur : un appel par référence (dédupliquées), sans cache, car le
 * lien d'extrait est signé et expire vite. Un titre introuvable ou sans extrait est absent du
 * résultat, seul. Dès la première indisponibilité du fournisseur, plus aucun appel n'est lancé
 * (les appels en vol se terminent) : les titres restants sont absents eux aussi.
 */
async function resolveProviderTracks(refs: string[]): Promise<Map<string, ProviderTrack>> {
  const tracks = new Map<string, ProviderTrack>()
  const pending = [...new Set(refs)]
  let unavailable = false

  const work = async () => {
    for (let ref = pending.shift(); ref !== undefined && !unavailable; ref = pending.shift()) {
      try {
        const track = await getProviderTrack(ref)

        if (track?.previewUrl) {
          tracks.set(ref, track)
        }
      } catch (error) {
        unavailable ||= error instanceof MediaProviderUnavailableError
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PROVIDER_MAX_CONCURRENT_REQUESTS, pending.length) }, work)
  )

  return tracks
}

/**
 * Thèmes actifs lisibles par la compagnie (tous, ou parmi `themeIds`). Avec `kidsOnly`, seuls les
 * thèmes adaptés aux enfants (mode enfants d'une partie).
 */
async function loadReadableThemes(
  companyId: number,
  themeIds?: Array<number | string>,
  kidsOnly = false
) {
  const query = db('themes')
    .where('status', THEME_STATUS_ACTIVE)
    .select('id', 'name', 'scope', 'company_id', 'playlist_ref')
    .orderBy('id', 'asc')

  if (themeIds) {
    query.whereIn('id', themeIds)
  }

  if (kidsOnly) {
    query.where('kids_friendly', true)
  }

  return (await query).filter((theme) => isReadableByCompany(theme as ScopedRow, companyId))
}

/**
 * Thèmes de playlist que la partie peut recevoir : mêmes thèmes que le catalogue (actifs, lisibles
 * par la compagnie, et adaptés aux enfants en mode enfants), donc même règle que `isInPlayableTheme`.
 */
export async function loadPlaylistThemes(companyId: number, kidsOnly = false) {
  return toPlaylistThemes(await loadReadableThemes(companyId, undefined, kidsOnly))
}

/**
 * Une question n'est jouable par la salle que si elle appartient à au moins un thème actif
 * lisible par sa compagnie : même règle que le catalogue, pour la route média. Avec `kidsOnly`
 * (partie en mode enfants), ce thème doit en plus être adapté aux enfants.
 */
export async function isInPlayableTheme(
  questionId: number,
  companyId: number,
  kidsOnly = false
): Promise<boolean> {
  const links = await db('question_themes').where('question_id', questionId).select('theme_id')

  if (links.length === 0) {
    return false
  }

  const themes = await loadReadableThemes(
    companyId,
    links.map((link) => link.theme_id),
    kidsOnly
  )

  return themes.length > 0
}

/**
 * Catalogue de la salle : thèmes actifs lisibles par la compagnie et leurs questions
 * actives de tous types, avec leurs réponses actives. Une question audio n'est retenue
 * que si son fichier est uploadé (US-MEDIA-01) ou si son titre de fournisseur d'extraits
 * répond encore avec un extrait (le lien est redemandé à chaque appel) ; une image / vidéo
 * que si elle a un lien. Le moteur trie ensuite par éligibilité de chaque mini-jeu. Les
 * thèmes vides sont écartés. Avec `questionIds`, seules ces questions sont chargées et résolues
 * (toujours filtrées par la compagnie). Les questions de fournisseur écartées font l'objet d'un
 * seul avertissement par chargement. Avec `kidsOnly` (partie en mode enfants), seuls les thèmes
 * adaptés aux enfants sont chargés : une question qui est aussi dans un autre thème n'en sort pas.
 * Les thèmes qui portent une playlist reçoivent en plus `questionsPerRound` titres tirés de la
 * playlist (jamais avec `questionIds` : une reprise ne tire rien de nouveau, voir la route `tracks`).
 */
export async function loadRoomContent(
  companyId: number,
  log: Pick<FastifyBaseLogger, 'warn'>,
  questionIds?: number[],
  kidsOnly = false,
  questionsPerRound: number = GAME_DEFAULT_QUESTIONS_PER_ROUND
): Promise<RoomContentTheme[]> {
  const themes = await loadReadableThemes(companyId, undefined, kidsOnly)
  const stored = await loadStoredContent(themes, companyId, log, questionIds)

  if (questionIds) {
    return stored
  }

  const byId = new Map(stored.map((theme) => [theme.id, theme]))

  for (const theme of await drawPlaylistThemes(toPlaylistThemes(themes), questionsPerRound, log)) {
    const existing = byId.get(theme.id)

    byId.set(
      theme.id,
      existing ? { ...existing, questions: [...existing.questions, ...theme.questions] } : theme
    )
  }

  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/** Questions enregistrées des thèmes donnés (le contenu d'avant les playlists). */
async function loadStoredContent(
  themes: Awaited<ReturnType<typeof loadReadableThemes>>,
  companyId: number,
  log: Pick<FastifyBaseLogger, 'warn'>,
  questionIds?: number[]
): Promise<RoomContentTheme[]> {
  if (themes.length === 0) {
    return []
  }

  const linksQuery = db('question_themes')
    .whereIn(
      'theme_id',
      themes.map((theme) => theme.id)
    )
    .select('question_id', 'theme_id')

  if (questionIds) {
    linksQuery.whereIn('question_id', questionIds)
  }

  const links = await linksQuery

  if (links.length === 0) {
    return []
  }

  const candidates = (
    await db('questions')
      .whereIn('id', [...new Set(links.map((link) => link.question_id))])
      .where('status', QUESTION_STATUS_ACTIVE)
      .select(
        'id',
        'question',
        'scope',
        'company_id',
        'type_media',
        'kind',
        'media_key',
        'media_url',
        'media_start_ms',
        'media_provider',
        'media_provider_ref',
        'audio_effect'
      )
      .orderBy('id', 'asc')
  ).filter((question) => isReadableByCompany(question as ScopedRow, companyId))

  const providerRefs = candidates.flatMap((question) => getProviderRef(question as MediaRow) ?? [])
  const providerTracks = await resolveProviderTracks(providerRefs)
  const droppedRefs = providerRefs.filter((ref) => !providerTracks.has(ref))

  if (droppedRefs.length > 0) {
    log.warn(
      {
        company_id: companyId,
        dropped: droppedRefs.length,
        refs: [...new Set(droppedRefs)].slice(0, LOG_MAX_REFS),
      },
      'provider questions dropped from the room content'
    )
  }

  const questions = candidates
    .map((question) => {
      const providerRef = getProviderRef(question as MediaRow)
      const track = providerRef === null ? null : (providerTracks.get(providerRef) ?? null)

      return {
        ...question,
        mediaUrl:
          providerRef === null
            ? resolvePlayableMediaUrl(question as MediaRow)
            : (track?.previewUrl ?? undefined),
        mediaCredit: track
          ? {
              provider: track.provider,
              title: track.title,
              artist: track.artist,
              coverUrl: track.coverUrl,
              link: track.link,
            }
          : null,
      }
    })
    .filter((question) => question.mediaUrl !== undefined)

  const answers =
    questions.length === 0
      ? []
      : await db('answers')
          .whereIn(
            'question_id',
            questions.map((question) => question.id)
          )
          .where('status', ANSWER_STATUS_ACTIVE)
          .select('id', 'question_id', 'response', 'is_correct')
          .orderBy('id', 'asc')

  const answersByQuestion = new Map<number, RoomContentAnswer[]>()

  for (const answer of answers) {
    const questionId = Number(answer.question_id)
    const list = answersByQuestion.get(questionId) ?? []
    list.push({
      id: Number(answer.id),
      text: answer.response,
      isCorrect: Boolean(answer.is_correct),
    })
    answersByQuestion.set(questionId, list)
  }

  const questionsById = new Map<number, RoomContentQuestion>(
    questions.map((question) => {
      const id = Number(question.id)

      return [
        id,
        {
          id,
          text: question.question,
          kind: question.kind ?? DEFAULT_QUESTION_KIND,
          mediaType: question.type_media,
          mediaUrl: question.mediaUrl ?? null,
          mediaStartMs: Number(question.media_start_ms ?? 0),
          audioEffect:
            (question.audio_effect as QuestionAudioEffect | null) ?? QUESTION_AUDIO_EFFECT_NONE,
          mediaCredit: question.mediaCredit,
          answers: answersByQuestion.get(id) ?? [],
        },
      ]
    })
  )

  return themes
    .map((theme) => ({
      id: Number(theme.id),
      name: theme.name,
      questions: links
        .filter((link) => Number(link.theme_id) === Number(theme.id))
        .map((link) => questionsById.get(Number(link.question_id)))
        .filter((question): question is RoomContentQuestion => Boolean(question)),
    }))
    .filter((theme) => theme.questions.length > 0)
}
