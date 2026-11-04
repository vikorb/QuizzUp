import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  ADMIN_ROLE_ROOM,
  GAME_PODIUMS,
  GAME_STATE_FINISHED,
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
import { ROOM_CONFIG_MAX_LENGTH, roomConfigSchema } from './companies/rooms/_schemas'
import { roomSelect } from './companies/rooms/_shared'
import { findGameInCompany } from './games/_shared'
import { getMediaVersion } from './questions/_shared'
import { isInPlayableTheme, isReadableByCompany, loadRoomContent } from './room/_content'

const roomGameParamsSchema = z.object({
  gameId: z.coerce.number().int().positive(),
})

// Scores finaux par pupitre (`podium` est unique dans une partie).
const roomGameFinishBodySchema = z.object({
  scores: z
    .array(
      z.object({
        podium: z.number().int().min(1).max(GAME_PODIUMS),
        score: z.number().int().min(-1_000_000).max(1_000_000),
      })
    )
    .max(GAME_PODIUMS),
})

const roomConfigBodySchema = z.object({
  config: roomConfigSchema,
  // Révision lue avec la config (`configRevision`). Absente : l'ancien comportement, on écrase.
  revision: z.number().int().min(0).optional(),
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

  return currentId === null ? null : findRoomGame(req, currentId)
}

/** Partie de la salle (quel que soit son état), au format du PC de la salle. */
async function findRoomGame(req: FastifyRequest, gameId: number) {
  const owned = await db('games')
    .where('id', gameId)
    .where('room_id', req.user.room_id)
    .where('company_id', req.user.company_id)
    .whereNot('status', GAME_STATUS_DELETED)
    .first('id')
  const game = owned ? await findGameInCompany(req.user.company_id, gameId) : null

  if (!game) {
    return null
  }

  return {
    ...game,
    // Un participant = un pupitre ; le 2e joueur facultatif partage son score.
    participants: (game.participants ?? []).map(
      ({ id, podium, displayName, secondPlayer, score }) => ({
        id,
        podium,
        displayName,
        secondDisplayName: secondPlayer?.displayName ?? null,
        score,
      })
    ),
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

  // Le PC de la salle enregistre sa configuration matérielle (buzzers appris, lumières…) dans
  // `rooms.config` (décision d'Enzo, 2026-11-04) ; il la relit avec `GET /room/me`. Les sections
  // envoyées remplacent celles du même nom, les autres sont gardées. Avec `revision`, l'écriture
  // n'a lieu que si la config n'a pas changé depuis cette lecture (sinon 409 + config courante) ;
  // sans `revision`, elle écrase (anciens clients). Chaque écriture augmente `config_revision`.
  app.put('/room/config', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const parsedBody = roomConfigBodySchema.safeParse(req.body)

    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() })
    }

    const current = await db('rooms')
      .where('id', req.user.room_id)
      .where('company_id', req.user.company_id)
      .whereNot('status', ROOM_STATUS_DELETED)
      .first('config')

    if (!current) {
      return reply.code(404).send({ error: 'not_found' })
    }

    // Fusion des clés de premier niveau : le PC envoie ses sections (ex. `buzzers`) sans
    // effacer celles réglées depuis le backoffice.
    const { revision } = parsedBody.data
    const config = { ...(current.config ?? {}), ...parsedBody.data.config }

    if (JSON.stringify(config).length > ROOM_CONFIG_MAX_LENGTH) {
      return reply.code(400).send({ error: 'room_config_too_large' })
    }
    const write = db('rooms')
      .where('id', req.user.room_id)
      .where('company_id', req.user.company_id)
      .whereNot('status', ROOM_STATUS_DELETED)

    if (revision !== undefined) {
      // Atomique : le test de la révision et l'écriture forment une seule requête.
      write.where('config_revision', revision)
    }
    const updated = await write
      .update({ config, config_revision: db.raw('config_revision + 1'), updated_at: db.fn.now() })
      .returning(roomSelect)
    const room = Array.isArray(updated) ? updated[0] : updated

    if (!room) {
      const latest = await db('rooms')
        .where('id', req.user.room_id)
        .where('company_id', req.user.company_id)
        .whereNot('status', ROOM_STATUS_DELETED)
        .first('config', 'config_revision')

      if (!latest) {
        return reply.code(404).send({ error: 'not_found' })
      }

      return reply.code(409).send({
        error: 'room_config_conflict',
        config: latest.config ?? {},
        configRevision: Number(latest.config_revision),
      })
    }

    return { room: room as RoomRow }
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
        !isValidMediaKey(question.media_key) ||
        !(await isInPlayableTheme(Number(question.id), req.user.company_id))
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

  // Fin de partie (podium) : la salle enregistre les scores et passe la partie « terminée ».
  // Idempotent : renvoyer la fin d'une partie déjà terminée ne change rien.
  app.post('/room/games/:gameId/finish', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const parsedParams = roomGameParamsSchema.safeParse(req.params)

    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const parsedBody = roomGameFinishBodySchema.safeParse(req.body)

    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() })
    }

    const { gameId } = parsedParams.data
    const game = await findRoomGame(req, gameId)

    if (!game) {
      return reply.code(404).send({ error: 'game_not_found' })
    }

    if (game.state === GAME_STATE_FINISHED) {
      return { game }
    }

    if (game.state !== GAME_STATE_PENDING && game.state !== GAME_STATE_RUNNING) {
      return reply.code(409).send({ error: 'game_already_over' })
    }

    const podiums = new Set(game.participants.map((participant) => participant.podium))
    const { scores } = parsedBody.data

    // Un score par pupitre inscrit, ni plus ni moins : pas de partie close à moitié notée.
    if (
      scores.length !== podiums.size ||
      scores.some((line) => !podiums.has(line.podium)) ||
      new Set(scores.map((line) => line.podium)).size !== scores.length
    ) {
      return reply.code(400).send({ error: 'game_scores_invalid' })
    }

    await db.transaction(async (trx) => {
      const updated = await trx('games')
        .where('id', gameId)
        .whereIn('state', [GAME_STATE_PENDING, GAME_STATE_RUNNING])
        .update({ state: GAME_STATE_FINISHED, finished_at: trx.fn.now(), updated_at: trx.fn.now() })

      // Une autre requête l'a terminée entre-temps : ses scores restent.
      if (!updated) {
        return
      }

      for (const { podium, score } of scores) {
        await trx('game_participants')
          .where({ game_id: gameId, podium })
          .update({ score, updated_at: trx.fn.now() })
      }
    })

    const finished = await findRoomGame(req, gameId)

    return finished?.state === GAME_STATE_FINISHED
      ? { game: finished }
      : reply.code(409).send({ error: 'game_already_over' })
  })
}

export default roomRoutes
