import type { FastifyPluginAsync } from 'fastify'

import {
  LIVE_EVENT,
  LIVE_HEARTBEAT_MS,
  LIVE_STATUS_EVERY_MS,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
} from '@quizzup/shared'
import db from '../db'
import { LIVE_MAX_STREAMS_PER_ACCOUNT } from '../live/hub'
import { canAccessCompanyContext } from '../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../security/permissions'
import { requireApiPermission } from '../security/requireApiPermission'
import { roomParamsSchema, roomsParamsSchema } from './companies/rooms/_schemas'
import { findRoomInCompany } from './companies/rooms/_shared'
import {
  roomCommandBodySchema,
  roomCommandResultBodySchema,
  roomCommandResultParamsSchema,
  roomStatusBodySchema,
} from './live/_schemas'
import { openSseStream } from './live/_stream'
import { isRoomAccount } from './room/_shared'

/**
 * Présence des salles en direct (US-LIVE-01) : la salle ouvre un flux et publie son état, le
 * personnel d'une compagnie ouvre un flux et reçoit l'état de ses salles. Le personnel lui envoie
 * des commandes (pause, reprise, passer, arrêter) et la salle les accuse : le serveur relaie, la
 * salle reste maître de la partie. Le hub est celui de l'application (`plugins/liveHub.ts`).
 */
const liveRoutes: FastifyPluginAsync = async (app) => {
  const hub = app.liveHub

  app.get('/room/stream', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const roomId = Number(req.user.room_id)
    let streamId = ''
    const sse = openSseStream(req, reply, () => hub.closeRoomStream(roomId, streamId))

    streamId = hub.openRoomStream(roomId, Number(req.user.company_id), sse)
    sse.send(LIVE_EVENT.HELLO, {
      streamId,
      heartbeatMs: LIVE_HEARTBEAT_MS,
      statusEveryMs: LIVE_STATUS_EVERY_MS,
    })

    return reply.send(sse.stream)
  })

  app.post('/room/status', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const parsedBody = roomStatusBodySchema.safeParse(req.body)

    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() })
    }

    const { streamId, ...report } = parsedBody.data
    const roomId = Number(req.user.room_id)

    // Un autre poste a ouvert son flux depuis : celui-ci ne doit plus publier. Sans aucun flux
    // ouvert (redémarrage du backend, coupure réseau), personne n'a pris la place : on accepte.
    if (streamId !== undefined && hub.isReplaced(roomId, streamId)) {
      return reply.code(409).send({ error: 'room_instance_replaced' })
    }

    hub.report(roomId, Number(req.user.company_id), report)

    return reply.code(204).send()
  })

  app.post(
    '/room/commands/:commandId/result',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!isRoomAccount(req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedParams = roomCommandResultParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = roomCommandResultBodySchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() })
      }

      // La salle vient du jeton : l'accusé d'une autre salle ne retrouve pas la commande.
      if (
        !hub.settleCommand(Number(req.user.room_id), parsedParams.data.commandId, parsedBody.data)
      ) {
        return reply.code(404).send({ error: 'command_unknown' })
      }

      return reply.code(204).send()
    }
  )

  app.post(
    '/companies/:companyId/rooms/:roomId/commands',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!requireApiPermission(req, reply, API_RESOURCE.GAME, API_ACTION.UPDATE)) {
        return
      }

      const parsedParams = roomParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = roomCommandBodySchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() })
      }

      const { companyId, roomId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const room = await findRoomInCompany(companyId, roomId)

      if (!room || room.status === ROOM_STATUS_DELETED) {
        return reply.code(404).send({ error: 'room_not_found' })
      }

      const { commandId, ...command } = parsedBody.data
      const outcome = hub.sendCommand(roomId, companyId, commandId, command)

      if (outcome === 'not_controllable') {
        return reply.code(409).send({ error: 'room_not_controllable' })
      }

      if (outcome === 'too_many') {
        return reply.code(429).send({ error: 'too_many_commands' })
      }

      // Un identifiant déjà reçu (nouvel essai du client) répond comme le premier envoi.
      return reply.code(202).send({ commandId })
    }
  )

  app.get('/companies/:companyId/live', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!requireApiPermission(req, reply, API_RESOURCE.GAME, API_ACTION.READ)) {
      return
    }

    const parsedParams = roomsParamsSchema.safeParse(req.params)

    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const { companyId } = parsedParams.data

    if (!canAccessCompanyContext(req, companyId)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const accountId = Number(req.user.sub)
    const tooManyStreams = () => hub.staffStreamCount(accountId) >= LIVE_MAX_STREAMS_PER_ACCOUNT

    if (tooManyStreams()) {
      return reply.code(429).send({ error: 'too_many_streams' })
    }

    const rooms = await db('rooms')
      .where('company_id', companyId)
      .where('status', ROOM_STATUS_ACTIVE)
      .orderBy('id', 'asc')
      .select('id')

    // Un autre flux du même compte a pu s'ouvrir pendant la lecture des salles.
    if (tooManyStreams()) {
      return reply.code(429).send({ error: 'too_many_streams' })
    }

    const sse = openSseStream(req, reply, () => unsubscribe())
    const unsubscribe = hub.subscribeStaff(companyId, accountId, sse)

    // Photo et abonnement dans le même tour : aucun changement ne passe entre les deux.
    sse.send(LIVE_EVENT.SNAPSHOT, {
      rooms: rooms.map((room: { id: number }) => hub.roomLive(Number(room.id))),
    })

    return reply.send(sse.stream)
  })
}

export default liveRoutes
