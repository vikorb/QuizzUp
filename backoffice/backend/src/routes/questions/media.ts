import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import {
  QUESTION_AUDIO_EXTENSIONS,
  QUESTION_AUDIO_MIME_TYPE_ALIASES,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_STATUS_DELETED,
} from '@quizzup/shared'
import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import {
  matchesAudioSignature,
  normalizeAudioMimeType,
  sanitizeOriginalName,
} from '../../storage/audioFile'
import {
  buildQuestionMediaKey,
  getMediaMaxBytes,
  getMediaStorage,
  isValidMediaKey,
} from '../../storage/mediaStorage'
import {
  canEditQuestion,
  canReadQuestion,
  getCurrentAdminId,
  getQuestionAccessRow,
  getQuestionWithAnswers,
  parsePositiveId,
  type QuestionAccessRow,
  type QuestionParams,
} from './_shared'

type MediaUploadQuery = {
  durationMs?: string
  fileName?: string
  rightsAttested?: string
}

type QuestionMediaRow = {
  media_key: string | null
  media_mime_type: string | null
  media_start_ms: number | string | null
}

type AccessResult =
  | { ok: true; questionId: number; question: QuestionAccessRow }
  | { ok: false; status: number; error: string }

const MAX_DURATION_MS = 60 * 60 * 1000

// Lecture de l'extrait en cache navigateur (privé) : la clé change à chaque upload, donc
// l'URL ne renvoie jamais un ancien fichier après remplacement (ETag = clé).
const MEDIA_CACHE_CONTROL = 'private, max-age=3600'

async function resolveQuestionAccess(
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

async function getQuestionMediaRow(questionId: number): Promise<QuestionMediaRow | null> {
  const row = await db('questions')
    .select('media_key', 'media_mime_type', 'media_start_ms')
    .where({ id: questionId })
    .first()

  return row ? (row as QuestionMediaRow) : null
}

function parseDurationMs(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === '') {
    return null
  }

  const durationMs = Number(value)

  if (!Number.isInteger(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
    return 'invalid'
  }

  return durationMs
}

function decodeFileName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  try {
    return sanitizeOriginalName(decodeURIComponent(value))
  } catch {
    return sanitizeOriginalName(value)
  }
}

/** On garde le point de départ s'il tombe encore dans le nouveau fichier, sinon retour à 0. */
function keepStartMs(currentStartMs: unknown, durationMs: number | null): number {
  const startMs = Number(currentStartMs ?? 0)

  if (!Number.isInteger(startMs) || startMs < 0) {
    return 0
  }

  return durationMs !== null && startMs >= durationMs ? 0 : startMs
}

async function removeStoredFile(req: FastifyRequest, key: string | null): Promise<void> {
  if (!isValidMediaKey(key)) {
    return
  }

  try {
    await getMediaStorage().remove(key)
  } catch (error) {
    // Un fichier orphelin ne doit pas faire échouer la requête : il est seulement journalisé.
    req.log.warn({ err: error, key }, 'question media removal failed')
  }
}

const questionMediaRoutes: FastifyPluginAsync = async (app) => {
  // Corps binaire brut : le navigateur envoie directement le fichier (`fetch(url, { body: file })`).
  // Le parseur n'existe que dans ce plugin, il ne change rien aux autres routes.
  app.addContentTypeParser(
    Object.keys(QUESTION_AUDIO_MIME_TYPE_ALIASES),
    { parseAs: 'buffer', bodyLimit: getMediaMaxBytes() },
    (_req, body, done) => {
      done(null, body)
    }
  )

  app.get<{ Params: QuestionParams }>(
    '/questions/:questionId/media',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.QUESTION, API_ACTION.READ)

      if (!hasPermission) {
        return
      }

      const access = await resolveQuestionAccess(req, 'read')

      if (!access.ok) {
        return reply.code(access.status).send({ error: access.error })
      }

      const media = await getQuestionMediaRow(access.questionId)

      if (!media?.media_key || !isValidMediaKey(media.media_key)) {
        return reply.code(404).send({ error: 'question_media_not_found' })
      }

      const etag = `"${media.media_key.split('/').pop()}"`

      reply.header('Cache-Control', MEDIA_CACHE_CONTROL)
      reply.header('ETag', etag)

      if (req.headers['if-none-match'] === etag) {
        return reply.code(304).send()
      }

      const file = await getMediaStorage().read(media.media_key)

      if (!file) {
        req.log.error({ key: media.media_key }, 'question media file missing from storage')
        return reply.code(404).send({ error: 'question_media_not_found' })
      }

      return reply
        .header('Content-Type', media.media_mime_type ?? 'application/octet-stream')
        .header('Content-Length', String(file.size))
        .header('X-Content-Type-Options', 'nosniff')
        .send(file.stream)
    }
  )

  app.put<{ Params: QuestionParams; Querystring: MediaUploadQuery; Body: Buffer }>(
    '/questions/:questionId/media',
    { preHandler: [app.authenticate], bodyLimit: getMediaMaxBytes() },
    async (
      req: FastifyRequest<{ Params: QuestionParams; Querystring: MediaUploadQuery; Body: Buffer }>,
      reply: FastifyReply
    ) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.QUESTION,
        API_ACTION.UPDATE
      )

      if (!hasPermission) {
        return
      }

      const adminId = getCurrentAdminId(req)

      if (adminId === null) {
        return reply.code(401).send({ error: 'unauthorized' })
      }

      const access = await resolveQuestionAccess(req, 'edit')

      if (!access.ok) {
        return reply.code(access.status).send({ error: access.error })
      }

      const mimeType = normalizeAudioMimeType(req.headers['content-type'])
      const content = req.body

      if (!mimeType) {
        return reply.code(415).send({ error: 'question_media_type_unsupported' })
      }

      if (!Buffer.isBuffer(content) || content.length === 0) {
        return reply.code(400).send({ error: 'question_media_required' })
      }

      if (!matchesAudioSignature(content, mimeType)) {
        return reply.code(400).send({ error: 'question_media_invalid_file' })
      }

      // Thèmes éditeur : son libre de droits ; thèmes maison : sous la responsabilité du centre.
      // Dans les deux cas l'uploadeur atteste avoir le droit de diffuser le fichier.
      if (req.query.rightsAttested !== 'true') {
        return reply.code(400).send({ error: 'question_media_rights_required' })
      }

      const durationMs = parseDurationMs(req.query.durationMs)

      if (durationMs === 'invalid') {
        return reply.code(400).send({ error: 'question_media_duration_invalid' })
      }

      const previous = await getQuestionMediaRow(access.questionId)
      const key = buildQuestionMediaKey(access.questionId, QUESTION_AUDIO_EXTENSIONS[mimeType])

      await getMediaStorage().save(key, content)

      try {
        await db('questions')
          .where({ id: access.questionId })
          .update({
            type_media: QUESTION_MEDIA_TYPE_AUDIO,
            media_url: null,
            media_key: key,
            media_mime_type: mimeType,
            media_size_bytes: content.length,
            media_duration_ms: durationMs,
            media_start_ms: keepStartMs(previous?.media_start_ms, durationMs),
            media_original_name: decodeFileName(req.query.fileName),
            media_uploaded_by: adminId,
            media_uploaded_at: db.fn.now(),
            media_rights_attested_at: db.fn.now(),
            updated_at: db.fn.now(),
          })
      } catch (error) {
        await removeStoredFile(req, key)
        throw error
      }

      if (previous?.media_key && previous.media_key !== key) {
        await removeStoredFile(req, previous.media_key)
      }

      const question = await getQuestionWithAnswers(access.questionId, req)

      return { question }
    }
  )

  app.delete<{ Params: QuestionParams }>(
    '/questions/:questionId/media',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.QUESTION,
        API_ACTION.UPDATE
      )

      if (!hasPermission) {
        return
      }

      const access = await resolveQuestionAccess(req, 'edit')

      if (!access.ok) {
        return reply.code(access.status).send({ error: access.error })
      }

      const previous = await getQuestionMediaRow(access.questionId)

      if (!previous?.media_key) {
        return reply.code(404).send({ error: 'question_media_not_found' })
      }

      await db('questions').where({ id: access.questionId }).update({
        media_key: null,
        media_mime_type: null,
        media_size_bytes: null,
        media_duration_ms: null,
        media_start_ms: 0,
        media_original_name: null,
        media_uploaded_by: null,
        media_uploaded_at: null,
        media_rights_attested_at: null,
        updated_at: db.fn.now(),
      })

      await removeStoredFile(req, previous.media_key)

      const question = await getQuestionWithAnswers(access.questionId, req)

      return { question }
    }
  )
}

export default questionMediaRoutes
