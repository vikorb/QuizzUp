import {
  DEFAULT_QUESTION_KIND,
  getQuestionKindMediaError,
  QUESTION_STATUS_DELETED,
  type QuestionKind,
  type QuestionMediaType,
} from '@quizzup/shared'
import type { FastifyRequest } from 'fastify'
import type { Knex } from 'knex'

import {
  canEditQuestion,
  canReadQuestion,
  DEFAULT_QUESTION_MEDIA_TYPE,
  getQuestionAccessRow,
  parsePositiveId,
  type QuestionAccessRow,
  type QuestionParams,
  validateMediaStartMs,
} from './_shared'

export type QuestionMediaRow = {
  status?: number | string | null
  kind?: string | null
  type_media?: string | null
  media_key: string | null
  media_mime_type: string | null
  media_start_ms: number | string | null
  media_duration_ms: number | string | null
  media_provider?: string | null
  audio_effect?: string | null
}

export type AccessResult =
  | { ok: true; questionId: number; question: QuestionAccessRow }
  | { ok: false; status: number; error: string }

export async function resolveQuestionAccess(
  req: FastifyRequest<{ Params: QuestionParams }>,
  mode: 'read' | 'edit'
): Promise<AccessResult> {
  const questionId = parsePositiveId(req.params.questionId)

  if (questionId === null) {
    return { ok: false, status: 400, error: 'question_id_invalid' }
  }

  const question = await getQuestionAccessRow(questionId)

  // Une question supprimée ne sert plus son fichier (US-MEDIA-01).
  if (!question || question.status === QUESTION_STATUS_DELETED) {
    return { ok: false, status: 404, error: 'question_not_found' }
  }

  const allowed = mode === 'read' ? canReadQuestion(question, req) : canEditQuestion(question, req)

  if (!allowed) {
    return { ok: false, status: 403, error: 'forbidden' }
  }

  return { ok: true, questionId, question }
}

/** Colonnes à remettre à zéro quand une question perd son fichier audio ou son extrait de fournisseur. */
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
    media_provider: null,
    media_provider_ref: null,
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
      'status',
      'kind',
      'type_media',
      'media_key',
      'media_mime_type',
      'media_start_ms',
      'media_duration_ms',
      'media_provider',
      'audio_effect'
    )
    .where({ id: questionId })
    .forUpdate()
    .first()

  return row ? (row as QuestionMediaRow) : null
}

/** Règle de la question refusée sous verrou : 400 par défaut, annule la transaction. */
export class QuestionRuleError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode = 400
  ) {
    super(code)
    this.name = 'QuestionRuleError'
  }
}

/**
 * Règle type / média sur la ligne verrouillée. `kind` et `typeMedia` sont les valeurs demandées
 * (`undefined` = inchangé, on garde alors celle de la base). Lève `QuestionRuleError`.
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
    throw new QuestionRuleError(kindMediaError)
  }
}

export type QuestionMediaPatchRequest = {
  kind?: QuestionKind
  typeMedia?: QuestionMediaType
  leavesAudio: boolean
  startMs?: number
}

/**
 * Partie type / média d'un `PATCH /questions/:id`, à appeler dans sa transaction avec la ligne
 * déjà verrouillée (`lockQuestionMediaRow`) : le couple type / média et le point de départ sont
 * contrôlés sur cet état.
 * Renvoie la clé du fichier détaché (à supprimer après le commit) ; lève
 * `QuestionRuleError` si la règle est refusée, ce qui annule toute la transaction.
 */
export async function applyQuestionMediaPatch(
  trx: Knex.Transaction,
  questionId: number,
  row: QuestionMediaRow | null,
  request: QuestionMediaPatchRequest
): Promise<string | null> {
  const checksKindMedia = request.kind !== undefined || request.typeMedia !== undefined

  if (!checksKindMedia && !request.leavesAudio && request.startMs === undefined) {
    return null
  }

  if (checksKindMedia) {
    assertKindMediaAllowed(row, request)
  }

  if (!request.leavesAudio && request.startMs === undefined) {
    return null
  }

  if (request.leavesAudio) {
    if (!row?.media_key && !row?.media_provider) {
      return null
    }

    await trx('questions').where({ id: questionId }).update(buildClearedMediaPatch(trx))

    return row?.media_key ?? null
  }

  if (!row?.media_key) {
    throw new QuestionRuleError('question_media_not_found')
  }

  const durationMs = row.media_duration_ms === null ? null : Number(row.media_duration_ms)
  const startError = validateMediaStartMs(request.startMs, durationMs)

  if (startError) {
    throw new QuestionRuleError(startError)
  }

  await trx('questions').where({ id: questionId }).update({ media_start_ms: request.startMs })

  return null
}
