import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_DELETED,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_STATUS_ACTIVE,
  ROOM_CONTENT_MAX_IDS,
  ROOM_STATUS_DELETED,
} from '@quizzup/shared'
import db from '../db'
import { getMediaStorage, isValidMediaKey } from '../storage/mediaStorage'
import type { RoomRow } from '../types/room'
import { ROOM_CONFIG_MAX_LENGTH, roomConfigSchema } from './companies/rooms/_schemas'
import { companyLogoUrl } from './companies/_shared'
import { roomSelect } from './companies/rooms/_shared'
import { addGameJoin, findGameInCompany, openScheduledGame } from './games/_shared'
import { getMediaVersion } from './questions/_shared'
import { isInPlayableTheme, isReadableByCompany, loadRoomContent } from './room/_content'
import { areRoundsAcceptable, roomRoundsSchema, saveGameRounds } from './room/_history'
import { findCurrentGameId } from './room/_join'
import { isRoomAccount, roomPodiumsSchema, roomScoresSchema } from './room/_shared'

const roomGameParamsSchema = z.object({
  gameId: z.coerce.number().int().positive(),
})

// Lancement : `podiums` = pupitres des participants chargés par la salle. Absent (ancien écran) :
// aucune vérification.
const roomGameStartBodySchema = z.object({ podiums: roomPodiumsSchema.optional() })

// Scores finaux par pupitre, et manches jouées (facultatives : un ancien écran n'en envoie pas).
const roomGameFinishBodySchema = z.object({
  scores: roomScoresSchema,
  rounds: roomRoundsSchema.optional(),
})

const roomConfigBodySchema = z.object({
  config: roomConfigSchema,
  // Révision lue avec la config (`configRevision`). Absente : l'ancien comportement, on écrase.
  revision: z.number().int().min(0).optional(),
})

// `ids` : identifiants de questions séparés par des virgules (entiers positifs, dédupliqués).
const roomContentQuerySchema = z.object({
  ids: z
    .string()
    .transform((value) => value.split(','))
    .pipe(
      z
        .array(z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()))
        .max(ROOM_CONTENT_MAX_IDS)
    )
    .transform((ids) => [...new Set(ids)])
    .optional(),
})

const roomQuestionParamsSchema = z.object({
  questionId: z.coerce.number().int().positive(),
})

// Même politique que la route staff : cache privé, toujours revalidé par l'ETag.
const MEDIA_CACHE_CONTROL = 'private, no-cache'

/** Partie en cours, sinon en attente, de la salle. Les emails restent côté backoffice. */
function findCurrentRoomGameId(
  req: FastifyRequest
): Promise<{ id: number; kidsMode: boolean } | null> {
  return findCurrentGameId(req.user.company_id, Number(req.user.room_id))
}

/** Prochaine session programmée de la salle dont la fin prévue est dans le futur (en retard comprise). */
async function findNextRoomGame(req: FastifyRequest) {
  const next = await db('games')
    .where('room_id', req.user.room_id)
    .where('company_id', req.user.company_id)
    .where('state', GAME_STATE_SCHEDULED)
    .whereNot('status', GAME_STATUS_DELETED)
    .where('scheduled_end_at', '>', new Date().toISOString())
    .orderBy('scheduled_at', 'asc')
    .first('id')

  return next ? findRoomGame(req, Number(next.id)) : null
}

async function findCurrentRoomGame(req: FastifyRequest) {
  const current = await findCurrentRoomGameId(req)

  return current === null ? null : findRoomGame(req, current.id)
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

    const company = await db('companies')
      .where('id', room.companyId)
      .first('id', 'name', 'logo_key')

    return {
      room,
      company: company
        ? { id: company.id, name: company.name, logoUrl: companyLogoUrl(company.logo_key) }
        : null,
    }
  })

  // Le PC de la salle enregistre sa configuration matérielle (buzzers appris, lumières…) dans
  // `rooms.config` (décision d'Enzo, 2026-11-04) ; il la relit avec `GET /room/me`. Les sections
  // envoyées remplacent celles du même nom, les autres sont gardées. Avec `revision`, l'écriture
  // n'a lieu que si la config n'a pas changé depuis cette lecture (sinon 409 + config courante) ;
  // sans `revision`, elle écrase (anciens clients). Chaque écriture augmente `config_revision`.
  // ponytail: le `PATCH` du backoffice n'envoie pas de révision (il écrase) ; à lui en faire envoyer
  // une quand son formulaire relira la config avant d'enregistrer.
  app.put('/room/config', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const parsedBody = roomConfigBodySchema.safeParse(req.body)

    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() })
    }

    const { config: sent, revision } = parsedBody.data
    const readRoom = () =>
      db('rooms')
        .where('id', req.user.room_id)
        .where('company_id', req.user.company_id)
        .whereNot('status', ROOM_STATUS_DELETED)
        .first('config', 'config_revision')
    const conflict = (row: { config: unknown; config_revision: unknown }) =>
      reply.code(409).send({
        error: 'room_config_conflict',
        config: row.config ?? {},
        configRevision: Number(row.config_revision),
      })

    let base = await readRoom()

    if (!base) {
      return reply.code(404).send({ error: 'not_found' })
    }

    // Révision « en avance » ou périmée : on ne fusionne rien, le poste recharge la config courante.
    if (revision !== undefined && revision !== Number(base.config_revision)) {
      return conflict(base)
    }

    // L'UPDATE est toujours conditionné à la révision lue avec la config fusionnée : un
    // `PATCH` du backoffice passé entre la lecture et l'écriture n'est jamais annulé. Sans
    // `revision` (ancien client), on relit et on refait la fusion une seule fois.
    for (let attempt = revision === undefined ? 2 : 1; attempt > 0; attempt -= 1) {
      // Fusion des clés de premier niveau : le PC envoie ses sections (ex. `buzzers`) sans
      // effacer celles réglées depuis le backoffice.
      const config = { ...(base.config ?? {}), ...sent }

      if (JSON.stringify(config).length > ROOM_CONFIG_MAX_LENGTH) {
        return reply.code(400).send({ error: 'room_config_too_large' })
      }
      const updated = await db('rooms')
        .where('id', req.user.room_id)
        .where('company_id', req.user.company_id)
        .whereNot('status', ROOM_STATUS_DELETED)
        .where('config_revision', base.config_revision)
        .update({ config, config_revision: db.raw('config_revision + 1'), updated_at: db.fn.now() })
        .returning(roomSelect)
      const room = Array.isArray(updated) ? updated[0] : updated

      if (room) {
        return { room: room as RoomRow }
      }
      const latest = await readRoom()

      if (!latest) {
        return reply.code(404).send({ error: 'not_found' })
      }
      base = latest
    }

    return conflict(base)
  })

  // US-GAME-08 : la salle récupère la partie lancée par l'opérateur…
  app.get('/room/games/current', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const game = await findCurrentRoomGame(req)

    // Lien d'inscription et nombre de demandes, jamais le nom d'une demande non validée.
    return {
      game: game ? await addGameJoin(game) : null,
      next: await findNextRoomGame(req),
    }
  })

  // Catalogue de la partie en cours : une question audio n'est jouable qu'avec un fichier ou un
  // extrait de fournisseur qui répond. `?ids=` le limite à ces questions (reprise d'une partie).
  app.get('/room/games/current/content', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const parsedQuery = roomContentQuerySchema.safeParse(req.query)

    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsedQuery.error.flatten() })
    }

    const current = await findCurrentRoomGameId(req)

    if (current === null) {
      return reply.code(404).send({ error: 'game_not_found' })
    }

    // Mode enfants : seuls les thèmes `kids_friendly` sont envoyés à la salle.
    return {
      themes: await loadRoomContent(
        req.user.company_id,
        req.log,
        parsedQuery.data.ids,
        current.kidsMode
      ),
    }
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

      const current = await findCurrentRoomGameId(req)

      if (current === null) {
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
        !(await isInPlayableTheme(Number(question.id), req.user.company_id, current.kidsMode))
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

    const parsedBody = roomGameStartBodySchema.safeParse(req.body ?? {})

    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() })
    }

    const current = await findCurrentRoomGame(req)

    if (!current || Number(current.id) !== parsedParams.data.gameId) {
      return reply.code(404).send({ error: 'game_not_found' })
    }

    if (current.state === GAME_STATE_PENDING) {
      const { podiums } = parsedBody.data

      // Même verrou que la validation d'une demande ou l'ajout d'un joueur : la liste comparée est
      // celle qui reste figée une fois la partie lancée.
      const outcome = await db.transaction(async (trx): Promise<'started' | 'changed' | 'gone'> => {
        const locked = await trx('games')
          .where('id', current.id)
          .where('company_id', req.user.company_id)
          .whereNot('status', GAME_STATUS_DELETED)
          .forUpdate()
          .first('state')

        if (!locked) {
          return 'gone'
        }

        // Lancée entre-temps par une autre requête : idempotent.
        if (locked.state !== GAME_STATE_PENDING) {
          return 'started'
        }

        if (podiums) {
          const rows = await trx('game_participants').where('game_id', current.id).select('podium')
          const stored = new Set(rows.map((row) => Number(row.podium)))

          if (stored.size !== podiums.length || podiums.some((podium) => !stored.has(podium))) {
            return 'changed'
          }
        }

        await trx('games')
          .where('id', current.id)
          .update({ state: GAME_STATE_RUNNING, started_at: trx.fn.now(), updated_at: trx.fn.now() })

        return 'started'
      })

      if (outcome === 'gone') {
        return reply.code(404).send({ error: 'game_not_found' })
      }

      if (outcome === 'changed') {
        return reply.code(409).send({ error: 'game_participants_changed' })
      }

      // Le personnel voit la partie passer « en cours » sans relire la fiche.
      app.liveHub.gameUpdated(
        Number(req.user.company_id),
        Number(req.user.room_id),
        Number(current.id)
      )
    }

    return { game: await findCurrentRoomGame(req) }
  })

  // « Lancer » : la salle ouvre une de ses sessions programmées (`scheduled` → `pending`), avec les
  // mêmes règles et les mêmes codes que le backoffice. Une autre salle ou compagnie : 404.
  app.post('/room/games/:gameId/open', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const parsedParams = roomGameParamsSchema.safeParse(req.params)

    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const { gameId } = parsedParams.data

    if (!(await findRoomGame(req, gameId))) {
      return reply.code(404).send({ error: 'game_not_found' })
    }

    const error = await openScheduledGame(req.user.company_id, gameId)

    if (error) {
      return error === 'not_found'
        ? reply.code(404).send({ error: 'game_not_found' })
        : reply.code(409).send({ error })
    }

    app.liveHub.gameUpdated(Number(req.user.company_id), Number(req.user.room_id), gameId)

    return { game: await findRoomGame(req, gameId) }
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
    const { scores, rounds } = parsedBody.data

    // Un score par pupitre inscrit, ni plus ni moins : pas de partie close à moitié notée.
    if (
      scores.length !== podiums.size ||
      scores.some((line) => !podiums.has(line.podium)) ||
      new Set(scores.map((line) => line.podium)).size !== scores.length
    ) {
      return reply.code(400).send({ error: 'game_scores_invalid' })
    }

    if (rounds && !(await areRoundsAcceptable(req.user.company_id, game.roundsCount, rounds))) {
      return reply.code(400).send({ error: 'game_rounds_invalid' })
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

      await saveGameRounds(trx, gameId, rounds ?? [])
    })

    const finished = await findRoomGame(req, gameId)

    return finished?.state === GAME_STATE_FINISHED
      ? { game: finished }
      : reply.code(409).send({ error: 'game_already_over' })
  })
}

export default roomRoutes
