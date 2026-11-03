import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  ADMIN_ROLE_ROOM,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATUS_DELETED,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
} from '@quizzup/shared'
import db from '../db'
import { getMediaStorage, isValidMediaKey } from '../storage/mediaStorage'
import type { RoomRow } from '../types/room'
import { roomSelect } from './companies/rooms/_shared'
import { findGameInCompany } from './games/_shared'
import { getMediaVersion } from './questions/_shared'
import { isReadableByCompany, loadRoomContent } from './room/_content'

const roomGameParamsSchema = z.object({
  gameId: z.coerce.number().int().positive(),
})

const roomQuestionParamsSchema = z.object({
  questionId: z.coerce.number().int().positive(),
})

// Même politique que la route staff : cache privé, toujours revalidé par l'ETag.
const MEDIA_CACHE_CONTROL = 'private, no-cache'

function isRoomAccount(req: FastifyRequest): boolean {
  return req.user.role === ADMIN_ROLE_ROOM && Boolean(req.user.room_id)
}

/** Partie en attente ou en cours de la salle. Les emails restent côté backoffice. */
async function findCurrentRoomGameId(req: FastifyRequest): Promise<number | null> {
  const current = await db('games')
    .where('room_id', req.user.room_id)
    .where('company_id', req.user.company_id)
    .whereIn('state', [GAME_STATE_PENDING, GAME_STATE_RUNNING])
    .whereNot('status', GAME_STATUS_DELETED)
    .first('id')

  return current ? Number(current.id) : null
}

async function findCurrentRoomGame(req: FastifyRequest) {
  const currentId = await findCurrentRoomGameId(req)

  if (currentId === null) {
    return null
  }

  const game = await findGameInCompany(req.user.company_id, currentId)

  if (!game) {
    return null
  }

  return {
    ...game,
    participants: (game.participants ?? []).map(({ id, podium, displayName, score }) => ({
      id,
      podium,
      displayName,
      score,
    })),
  }
}

/**
 * Routes du PC de la salle (US-ROOM-02). Elles ne servent qu'aux comptes de
 * rôle `room`, qui n'ont accès à aucune autre route du backoffice.
 */
const roomRoutes: FastifyPluginAsync = async (app) => {
  app.get('/room/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const room = (await db('rooms')
      .where('id', req.user.room_id)
      .where('company_id', req.user.company_id)
      .first(roomSelect)) as RoomRow | undefined

    if (!room || room.status === ROOM_STATUS_DELETED) {
      return reply.code(404).send({ error: 'not_found' })
    }

    const company = await db('companies').where('id', room.companyId).first('id', 'name')

    return { room, company: company ?? null }
  })

  // US-GAME-08 : la salle récupère la partie lancée par l'opérateur…
  app.get('/room/games/current', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    return { game: await findCurrentRoomGame(req) }
  })

  // Catalogue de la partie en cours : seules les questions audio avec un fichier sont jouables.
  app.get('/room/games/current/content', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    if ((await findCurrentRoomGameId(req)) === null) {
      return reply.code(404).send({ error: 'game_not_found' })
    }

    return { themes: await loadRoomContent(req.user.company_id) }
  })

  // Extrait audio d'une question jouable, lisible seulement pendant une partie de la salle.
  app.get(
    '/room/questions/:questionId/media',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!isRoomAccount(req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedParams = roomQuestionParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'question_id_invalid' })
      }

      if ((await findCurrentRoomGameId(req)) === null) {
        return reply.code(404).send({ error: 'game_not_found' })
      }

      const question = await db('questions')
        .where('id', parsedParams.data.questionId)
        .first('id', 'status', 'type_media', 'scope', 'company_id', 'media_key', 'media_mime_type')

      if (
        !question ||
        question.status !== QUESTION_STATUS_ACTIVE ||
        question.type_media !== QUESTION_MEDIA_TYPE_AUDIO ||
        !isReadableByCompany(question, req.user.company_id) ||
        !isValidMediaKey(question.media_key)
      ) {
        return reply.code(404).send({ error: 'question_media_not_found' })
      }

      const etag = `"${getMediaVersion(question.media_key)}"`

      reply.header('Cache-Control', MEDIA_CACHE_CONTROL)
      reply.header('Vary', 'Authorization')
      reply.header('ETag', etag)

      if (req.headers['if-none-match'] === etag) {
        return reply.code(304).send()
      }

      const file = await getMediaStorage().read(question.media_key)

      if (!file) {
        req.log.error({ key: question.media_key }, 'room media file missing from storage')
        return reply.code(404).send({ error: 'question_media_not_found' })
      }

      return reply
        .header('Content-Type', question.media_mime_type ?? 'application/octet-stream')
        .header('Content-Length', String(file.size))
        .header('X-Content-Type-Options', 'nosniff')
        .send(file.stream)
    }
  )

  // … puis accuse réception en la démarrant (idempotent si elle tourne déjà).
  app.post('/room/games/:gameId/start', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const parsedParams = roomGameParamsSchema.safeParse(req.params)

    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const current = await findCurrentRoomGame(req)

    if (!current || Number(current.id) !== parsedParams.data.gameId) {
      return reply.code(404).send({ error: 'game_not_found' })
    }

    if (current.state === GAME_STATE_PENDING) {
      await db('games')
        .where('id', current.id)
        .where('state', GAME_STATE_PENDING)
        .update({ state: GAME_STATE_RUNNING, started_at: db.fn.now(), updated_at: db.fn.now() })
    }

    return { game: await findCurrentRoomGame(req) }
  })
}

export default roomRoutes
