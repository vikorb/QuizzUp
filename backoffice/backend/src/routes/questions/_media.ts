import type { FastifyRequest } from 'fastify'
import type { Knex } from 'knex'

import { getMediaStorage, isValidMediaKey } from '../../storage/mediaStorage'
import { validateMediaStartMs } from './_shared'

export type QuestionMediaRow = {
  media_key: string | null
  media_mime_type: string | null
  media_start_ms: number | string | null
  media_duration_ms: number | string | null
}

/** Colonnes à remettre à zéro quand une question perd son fichier audio. */
export function buildClearedMediaPatch(trx: Knex | Knex.Transaction) {
  return {
    media_key: null,
    media_mime_type: null,
    media_size_bytes: null,
    media_duration_ms: null,
    media_start_ms: 0,
    media_original_name: null,
    media_uploaded_by: null,
    media_uploaded_at: null,
    media_rights_attested_at: null,
    updated_at: trx.fn.now(),
  }
}

/**
 * Verrouille la ligne le temps de la transaction : deux uploads (ou upload + retrait)
 * simultanés voient chacun la vraie clé remplacée, aucun fichier ne reste orphelin.
 */
export async function lockQuestionMediaRow(
  trx: Knex.Transaction,
  questionId: number
): Promise<QuestionMediaRow | null> {
  const row = await trx('questions')
    .select('media_key', 'media_mime_type', 'media_start_ms', 'media_duration_ms')
    .where({ id: questionId })
    .forUpdate()
    .first()

  return row ? (row as QuestionMediaRow) : null
}

/** Suppression au mieux, après le commit : un fichier orphelin est journalisé, pas bloquant. */
export async function removeStoredMediaFile(
  req: FastifyRequest,
  key: string | null | undefined
): Promise<void> {
  if (!isValidMediaKey(key)) {
    return
  }

  try {
    await getMediaStorage().remove(key)
  } catch (error) {
    req.log.warn({ err: error, key }, 'question media removal failed')
  }
}

export class QuestionMediaPatchError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'QuestionMediaPatchError'
  }
}

export type QuestionMediaPatchRequest = {
  leavesAudio: boolean
  startMs?: number
}

/**
 * Partie média d'un `PATCH /questions/:id`, à appeler dans sa transaction. Renvoie la clé du
 * fichier détaché (à supprimer après le commit) ; lève `QuestionMediaPatchError` si le point
 * de départ est refusé, ce qui annule toute la transaction.
 */
export async function applyQuestionMediaPatch(
  trx: Knex.Transaction,
  questionId: number,
  request: QuestionMediaPatchRequest
): Promise<string | null> {
  if (!request.leavesAudio && request.startMs === undefined) {
    return null
  }

  const row = await lockQuestionMediaRow(trx, questionId)

  if (request.leavesAudio) {
    if (!row?.media_key) {
      return null
    }

    await trx('questions').where({ id: questionId }).update(buildClearedMediaPatch(trx))

    return row.media_key
  }

  if (!row?.media_key) {
    throw new QuestionMediaPatchError('question_media_not_found')
  }

  const durationMs = row.media_duration_ms === null ? null : Number(row.media_duration_ms)
  const startError = validateMediaStartMs(request.startMs, durationMs)

  if (startError) {
    throw new QuestionMediaPatchError(startError)
  }

  await trx('questions').where({ id: questionId }).update({ media_start_ms: request.startMs })

  return null
}
