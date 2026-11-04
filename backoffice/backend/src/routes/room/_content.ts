import {
  ANSWER_STATUS_ACTIVE,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPE_VIDEO,
  QUESTION_STATUS_ACTIVE,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
} from '@quizzup/shared'

import db from '../../db'

/** Forme attendue par le moteur de jeu (`EngineTheme` de `@quizzup/game-engine`). */
export type RoomContentAnswer = { id: number; text: string; isCorrect: boolean }

export type RoomContentQuestion = {
  id: number
  text: string
  mediaType: string
  /** Audio : chemin relatif à l'API, à préfixer par son URL de base. Image / vidéo : lien. */
  mediaUrl: string | null
  mediaStartMs: number
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

type MediaRow = { id: number | string; type_media: string; media_key: unknown; media_url: unknown }

/**
 * URL du média jouable, `null` sans média, ou `undefined` si la question n'est pas jouable :
 * un audio sans fichier uploadé, ou une image / vidéo sans lien.
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

/** Thèmes actifs lisibles par la compagnie (tous, ou parmi `themeIds`). */
async function loadReadableThemes(companyId: number, themeIds?: Array<number | string>) {
  const query = db('themes')
    .where('status', THEME_STATUS_ACTIVE)
    .select('id', 'name', 'scope', 'company_id')
    .orderBy('id', 'asc')

  if (themeIds) {
    query.whereIn('id', themeIds)
  }

  return (await query).filter((theme) => isReadableByCompany(theme as ScopedRow, companyId))
}

/**
 * Une question n'est jouable par la salle que si elle appartient à au moins un thème actif
 * lisible par sa compagnie : même règle que le catalogue, pour la route média.
 */
export async function isInPlayableTheme(questionId: number, companyId: number): Promise<boolean> {
  const links = await db('question_themes').where('question_id', questionId).select('theme_id')

  if (links.length === 0) {
    return false
  }

  const themes = await loadReadableThemes(
    companyId,
    links.map((link) => link.theme_id)
  )

  return themes.length > 0
}

/**
 * Catalogue de la salle : thèmes actifs lisibles par la compagnie et leurs questions
 * actives de tous types, avec leurs réponses actives. Une question audio n'est retenue
 * que si son fichier est uploadé (US-MEDIA-01), une image / vidéo que si elle a un lien.
 * Le moteur trie ensuite par éligibilité de chaque mini-jeu. Les thèmes vides sont écartés.
 */
export async function loadRoomContent(companyId: number): Promise<RoomContentTheme[]> {
  const themes = await loadReadableThemes(companyId)

  if (themes.length === 0) {
    return []
  }

  const links = await db('question_themes')
    .whereIn(
      'theme_id',
      themes.map((theme) => theme.id)
    )
    .select('question_id', 'theme_id')

  if (links.length === 0) {
    return []
  }

  const questions = (
    await db('questions')
      .whereIn('id', [...new Set(links.map((link) => link.question_id))])
      .where('status', QUESTION_STATUS_ACTIVE)
      .select(
        'id',
        'question',
        'scope',
        'company_id',
        'type_media',
        'media_key',
        'media_url',
        'media_start_ms'
      )
      .orderBy('id', 'asc')
  )
    .filter((question) => isReadableByCompany(question as ScopedRow, companyId))
    .map((question) => ({ ...question, mediaUrl: resolvePlayableMediaUrl(question as MediaRow) }))
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
          mediaType: question.type_media,
          mediaUrl: question.mediaUrl ?? null,
          mediaStartMs: Number(question.media_start_ms ?? 0),
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
