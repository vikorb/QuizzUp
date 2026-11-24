import type { FastifyPluginAsync } from 'fastify'

import { findBookableRooms, toPublicRoom } from './_rooms'

/** `GET /public/v1/rooms` : les salles de la compagnie de la clé ouvertes à la réservation. */
const publicRoomRoutes: FastifyPluginAsync = async (app) => {
  app.get('/rooms', async (req) => {
    const rooms = await findBookableRooms(req.apiKey!.companyId)

    return { rooms: rooms.map(toPublicRoom) }
  })
}

export default publicRoomRoutes
