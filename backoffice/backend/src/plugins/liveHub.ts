import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

import { createLiveHub, type LiveHub } from '../live/hub'

/**
 * Hub du direct (US-LIVE-01), unique pour l'application : les routes de présence et de commandes
 * à distance, et l'arrêt d'une partie, parlent au même. Il s'arrête avec l'application.
 */
const liveHubPlugin: FastifyPluginAsync = async (app) => {
  const hub = createLiveHub()

  app.decorate('liveHub', hub)
  app.addHook('onClose', async () => hub.close())
}

declare module 'fastify' {
  interface FastifyInstance {
    liveHub: LiveHub
  }
}

export default fp(liveHubPlugin)
