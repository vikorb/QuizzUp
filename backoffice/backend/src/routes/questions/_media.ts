import type { FastifyRequest } from 'fastify'
import type { Knex } from 'knex'

import {
  DEFAULT_QUESTION_KIND,
  getQuestionKindMediaError,
  type QuestionKind,
  type QuestionMediaType,
} from '@quizzup/shared'

import { getMediaStorage, isValidMediaKey } from '../../storage/mediaStorage'
import { DEFAULT_QUESTION_MEDIA_TYPE, validateMediaStartMs } from './_shared'

export type QuestionMediaRow = {
  kind?: string | null
  type_media?: string | null
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
 * simultanés voient chacun la vraie clé remplacée, aucun fichier ne reste orphelin. Le type
 * (`kind`) et le type de média sont relus sous le même verrou : la règle « un extrait audio
 * seulement sur un QCM » se vérifie sur l'état réel, pas sur une lecture déjà périmée.
 */
export async function lockQuestionMediaRow(
  trx: Knex.Transaction,
  questionId: number
): Promise<QuestionMediaRow | null> {
  const row = await trx('questions')
    .select(
      'kind',
      'type_media',
      'media_key',
      'media_mime_type',
      'media_start_ms',
      'media_duration_ms'
    )
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

/**
 * Règle type / média sur la ligne verrouillée. `kind` et `typeMedia` sont les valeurs demandées
 * (`undefined` = inchangé, on garde alors celle de la base). Lève `QuestionMediaPatchError`.
 */
export function assertKindMediaAllowed(
  row: QuestionMediaRow | null,
  requested: { kind?: QuestionKind; typeMedia?: QuestionMediaType }
): void {
  const kindMediaError = getQuestionKindMediaError(
    requested.kind ?? (row?.kind as QuestionKind | null | undefined) ?? DEFAULT_QUESTION_KIND,
    requested.typeMedia ??
      (row?.type_media as QuestionMediaType | null | undefined) ??
      DEFAULT_QUESTION_MEDIA_TYPE
  )

  if (kindMediaError) {
    throw new QuestionMediaPatchError(kindMediaError)
  }
}

export type QuestionMediaPatchRequest = {
  kind?: QuestionKind
  typeMedia?: QuestionMediaType
  leavesAudio: boolean
  startMs?: number
}

/**
 * Partie type / média d'un `PATCH /questions/:id`, à appeler dans sa transaction. La ligne est
 * verrouillée, puis le couple type / média et le point de départ sont contrôlés sur cet état.
 * Renvoie la clé du fichier détaché (à supprimer après le commit) ; lève
 * `QuestionMediaPatchError` si la règle est refusée, ce qui annule toute la transaction.
 */
export async function applyQuestionMediaPatch(
  trx: Knex.Transaction,
  questionId: number,
  request: QuestionMediaPatchRequest
): Promise<string | null> {
  const checksKindMedia = request.kind !== undefined || request.typeMedia !== undefined

  if (!checksKindMedia && !request.leavesAudio && request.startMs === undefined) {
    return null
  }

  const row = await lockQuestionMediaRow(trx, questionId)

  if (checksKindMedia) {
    assertKindMediaAllowed(row, request)
  }

  if (!request.leavesAudio && request.startMs === undefined) {
    return null
  }

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
