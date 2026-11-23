import type { FastifyPluginAsync } from 'fastify'

import { ROOM_STATUS_DELETED } from '@quizzup/shared'
import db from '../../db'
import { createRateLimiter, replyTooManyRequests } from '../../security/rateLimit'
import {
  pruneRoomLogs,
  ROOM_LOG_BODY_LIMIT_BYTES,
  ROOM_LOG_RATE_LIMIT_MAX,
  ROOM_LOG_RATE_LIMIT_WINDOW_MS,
  roomLogsBodySchema,
} from './_logs'
import { isRoomAccount } from './_shared'

/**
 * Journaux d'erreurs de l'écran de salle (lot 7e). La salle et la compagnie viennent toujours du
 * jeton : une salle ne peut écrire que pour elle-même.
 */
const roomLogsRoutes: FastifyPluginAsync = async (app) => {
  const limiter = createRateLimiter({
    max: ROOM_LOG_RATE_LIMIT_MAX,
    windowMs: ROOM_LOG_RATE_LIMIT_WINDOW_MS,
  })

  // Un corps trop gros reçoit un code stable plutôt que le message brut de Fastify.
  app.setErrorHandler((error, _req, reply) => {
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({ error: 'payload_too_large' })
    }

    return reply.send(error)
  })

  app.post(
    '/room/logs',
    { preHandler: [app.authenticate], bodyLimit: ROOM_LOG_BODY_LIMIT_BYTES },
    async (req, reply) => {
      const { company_id: companyId, room_id: roomId } = req.user

      // `isRoomAccount` garantit déjà une salle ; le test de `roomId` sert au typage.
      if (!isRoomAccount(req) || !roomId) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      // Compté avant la validation : un poste qui envoie en boucle des corps invalides est limité
      // lui aussi. La clé est la salle, pas l'adresse (plusieurs salles peuvent partager une IP).
      const limit = limiter.hit(`room:${roomId}`)

      if (!limit.allowed) {
        return replyTooManyRequests(reply, limit.retryAfterSeconds)
      }

      const parsedBody = roomLogsBodySchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() })
      }

      const room = await db('rooms')
        .where('id', roomId)
        .where('company_id', companyId)
        .whereNot('status', ROOM_STATUS_DELETED)
        .first('id')

      if (!room) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const { appVersion, entries } = parsedBody.data
      const now = Date.now()

      await db.transaction(async (trx) => {
        await trx('room_logs').insert(
          entries.map((entry) => ({
            company_id: companyId,
            room_id: roomId,
            level: entry.level,
            code: entry.code,
            message: entry.message,
            context: entry.context,
            app_version: appVersion,
            occurrences: entry.occurrences,
            // Une horloge de poste en avance ne date pas une erreur dans le futur.
            occurred_at: new Date(Math.min(Date.parse(entry.occurredAt), now)),
          }))
        )
        await pruneRoomLogs(trx, roomId)
      })

      return reply.code(204).send()
    }
  )
}

export default roomLogsRoutes
