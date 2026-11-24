import {
  DEFAULT_QUESTION_KIND,
  getQuestionKindMediaError,
  QUESTION_MEDIA_PROVIDER_EXTRACT_MS,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_STATUS_DELETED,
} from '@quizzup/shared'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { getProviderTrack, MediaProviderUnavailableError } from '../../services/mediaProvider'
import { removeStoredMediaFile } from '../_shared/storedMedia'
import {
  assertKindMediaAllowed,
  lockQuestionMediaRow,
  QuestionRuleError,
  resolveQuestionAccess,
} from './_media'
import { questionMediaProviderBodySchema } from './_schemas'
import { getCurrentAdminId, getQuestionWithAnswers, type QuestionParams } from './_shared'

const ORIGINAL_NAME_MAX_LENGTH = 255

const questionMediaProviderRoutes: FastifyPluginAsync = async (app) => {
  // Rattache la question à un titre d'un fournisseur d'extraits : le serveur ne garde que sa
  // référence et ne télécharge rien (le lien d'extrait est redemandé à chaque envoi à la salle).
  app.put<{ Params: QuestionParams; Body: unknown }>(
    '/questions/:questionId/media/provider',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: QuestionParams; Body: unknown }>, reply: FastifyReply) => {
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

      const parsedBody = questionMediaProviderBodySchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'question_media_provider_invalid' })
      }

      // Refus rapide, avant d'appeler le fournisseur, sur la lecture non verrouillée : la règle
      // fait foi sous verrou (plus bas).
      const kindMediaError = getQuestionKindMediaError(
        access.question.kind ?? DEFAULT_QUESTION_KIND,
        QUESTION_MEDIA_TYPE_AUDIO
      )

      if (kindMediaError) {
        return reply.code(400).send({ error: kindMediaError })
      }

      // Appel réseau avant la transaction : pas de verrou de ligne tenu pendant l'attente.
      let track

      try {
        track = await getProviderTrack(parsedBody.data.ref)
      } catch (error) {
        if (error instanceof MediaProviderUnavailableError) {
          req.log.warn({ err: error }, 'media provider unavailable')
          return reply.code(502).send({ error: 'media_provider_unavailable' })
        }

        throw error
      }

      if (!track) {
        return reply.code(404).send({ error: 'question_media_provider_track_not_found' })
      }

      if (!track.previewUrl) {
        return reply.code(409).send({ error: 'question_media_provider_no_preview' })
      }

      let replacedKey: string | null

      try {
        replacedKey = await db.transaction(async (trx) => {
          const previous = await lockQuestionMediaRow(trx, access.questionId)

          if (!previous || Number(previous.status) === QUESTION_STATUS_DELETED) {
            throw new QuestionRuleError('question_not_found', 404)
          }

          // Contrôle sur la ligne verrouillée : un PATCH du type a pu passer pendant l'appel.
          assertKindMediaAllowed(previous, { typeMedia: QUESTION_MEDIA_TYPE_AUDIO })

          // Le fichier importé est vidé dans la même mise à jour : les deux s'excluent (CHECK).
          await trx('questions')
            .where({ id: access.questionId })
            .update({
              type_media: QUESTION_MEDIA_TYPE_AUDIO,
              media_url: null,
              media_key: null,
              media_mime_type: null,
              media_size_bytes: null,
              media_duration_ms: QUESTION_MEDIA_PROVIDER_EXTRACT_MS,
              media_start_ms: 0,
              media_original_name: `${track.artist} — ${track.title}`.slice(
                0,
                ORIGINAL_NAME_MAX_LENGTH
              ),
              media_uploaded_by: adminId,
              media_uploaded_at: trx.fn.now(),
              media_rights_attested_at: null,
              media_provider: track.provider,
              media_provider_ref: track.ref,
              updated_at: trx.fn.now(),
            })

          return previous.media_key
        })
      } catch (error) {
        if (error instanceof QuestionRuleError) {
          return reply.code(error.statusCode).send({ error: error.code })
        }

        throw error
      }

      await removeStoredMediaFile(req, replacedKey)

      const question = await getQuestionWithAnswers(access.questionId, req)

      return { question }
    }
  )
}

export default questionMediaProviderRoutes
