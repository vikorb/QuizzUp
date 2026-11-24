import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

import db from '../db'
import { PUBLIC_API_PREFIX } from '../routes/public/_shared'

const REGISTRATION_URL = `${PUBLIC_API_PREFIX}/join/registrations`

/**
 * Prévient la salle et le personnel quand un téléphone envoie une demande d'inscription
 * (événement `game_updated`). La route publique ne parle pas au hub : ce crochet lit le jeton du
 * corps après la réponse `201`, retrouve la partie et diffuse son seul identifiant.
 */
// ponytail: crochet posé à côté de la route publique pour ne pas la toucher ; à remplacer par un
// appel direct à `app.liveHub.gameUpdated` dans `routes/public/join.ts` dès qu'elle est libre.
const liveJoinRegistrationsPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onResponse', async (req, reply) => {
    const token = (req.body as { token?: unknown } | undefined)?.token

    if (
      reply.statusCode !== 201 ||
      req.routeOptions.url !== REGISTRATION_URL ||
      typeof token !== 'string'
    ) {
      return
    }

    try {
      const game = await db('games')
        .where('join_token', token)
        .first(['id', 'company_id as companyId', 'room_id as roomId'])

      if (game) {
        app.liveHub.gameUpdated(Number(game.companyId), Number(game.roomId), Number(game.id))
      }
    } catch (error) {
      // Les écrans se rattraperont à leur prochaine lecture : la demande, elle, est déjà enregistrée.
      req.log.warn({ err: error }, 'game_updated after registration failed')
    }
  })
}

export default fp(liveJoinRegistrationsPlugin)
