import type { FastifyPluginAsync } from 'fastify'

import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { MediaProviderUnavailableError, searchProviderTracks } from '../../services/mediaProvider'
import { mediaCatalogTracksQuerySchema } from './_schemas'

/** Recherche de titres chez le fournisseur d'extraits, pour rattacher une question audio. */
const mediaCatalogRoutes: FastifyPluginAsync = async (app) => {
  app.get('/media-catalog/tracks', { preHandler: [app.authenticate] }, async (req, reply) => {
    // Même droit que le rattachement d'un extrait à une question.
    if (!requireApiPermission(req, reply, API_RESOURCE.QUESTION, API_ACTION.UPDATE)) {
      return
    }

    const parsedQuery = mediaCatalogTracksQuerySchema.safeParse(req.query)

    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsedQuery.error.flatten() })
    }

    try {
      const tracks = await searchProviderTracks(parsedQuery.data.q, parsedQuery.data.limit)

      // Un titre sans extrait ne peut pas être joué : inutile de le proposer.
      return { items: tracks.filter((track) => track.previewUrl !== null) }
    } catch (error) {
      if (error instanceof MediaProviderUnavailableError) {
        req.log.warn({ err: error }, 'media provider unavailable')
        return reply.code(502).send({ error: 'media_provider_unavailable' })
      }

      throw error
    }
  })
}

export default mediaCatalogRoutes
