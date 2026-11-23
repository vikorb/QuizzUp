import type { FastifyPluginAsync } from 'fastify'

import {
  LIVE_EVENT,
  LIVE_HEARTBEAT_MS,
  LIVE_STATUS_EVERY_MS,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import db from '../db'
import { createLiveHub, LIVE_MAX_STREAMS_PER_ACCOUNT } from '../live/hub'
import { canAccessCompanyContext } from '../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../security/permissions'
import { requireApiPermission } from '../security/requireApiPermission'
import { roomsParamsSchema } from './companies/rooms/_schemas'
import { roomStatusBodySchema } from './live/_schemas'
import { openSseStream } from './live/_stream'
import { isRoomAccount } from './room/_shared'

/**
 * Présence des salles en direct (US-LIVE-01) : la salle ouvre un flux et publie son état, le
 * personnel d'une compagnie ouvre un flux et reçoit l'état de ses salles. Le hub est propre à
 * l'application : il s'arrête avec elle.
 */
const liveRoutes: FastifyPluginAsync = async (app) => {
  const hub = createLiveHub()

  app.addHook('onClose', async () => hub.close())

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
