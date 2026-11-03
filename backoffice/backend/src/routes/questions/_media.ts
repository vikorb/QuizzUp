import type { FastifyRequest } from 'fastify'
import type { Knex } from 'knex'

import { getMediaStorage, isValidMediaKey } from '../../storage/mediaStorage'

export type QuestionMediaRow = {
  media_key: string | null
  media_mime_type: string | null
  media_start_ms: number | string | null
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
    .select('media_key', 'media_mime_type', 'media_start_ms')
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
