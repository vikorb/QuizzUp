import {
  ANSWER_STATUS_ACTIVE,
  QUESTION_MEDIA_TYPE_AUDIO,
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
  /** Chemin relatif à l'API, à préfixer par son URL de base. */
  mediaUrl: string
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

/**
 * Catalogue de la salle pour le blind test éclair : thèmes actifs lisibles par la
 * compagnie, et seulement leurs questions audio actives qui ont un fichier uploadé
 * (US-MEDIA-01), avec leurs réponses actives. Les thèmes vides sont écartés.
 */
export async function loadRoomContent(companyId: number): Promise<RoomContentTheme[]> {
  const themes = (
    await db('themes')
      .where('status', THEME_STATUS_ACTIVE)
      .select('id', 'name', 'scope', 'company_id')
      .orderBy('id', 'asc')
  ).filter((theme) => isReadableByCompany(theme as ScopedRow, companyId))

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
      .where('type_media', QUESTION_MEDIA_TYPE_AUDIO)
      .whereNotNull('media_key')
      .select('id', 'question', 'scope', 'company_id', 'media_start_ms')
      .orderBy('id', 'asc')
  ).filter((question) => isReadableByCompany(question as ScopedRow, companyId))

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
          mediaType: QUESTION_MEDIA_TYPE_AUDIO,
          mediaUrl: roomMediaUrl(id),
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
