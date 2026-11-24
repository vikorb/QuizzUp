import { COMPANY_STATUS_DELETED } from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import db from '../../db'
import { getMediaStorage, isValidMediaKey } from '../../storage/mediaStorage'
import { sendPublicError } from './_shared'

// L'uuid change à chaque envoi : l'URL d'un fichier ne change jamais de contenu.
const LOGO_CACHE_CONTROL = 'public, max-age=31536000, immutable'

const logoParamsSchema = z.object({ file: z.string().max(100) })

/**
 * `GET /public/v1/logos/:file` : le logo d'un centre, sans authentification (écran de salle,
 * feuille de résultats, page d'un bon). Tout refus répond le même 404 : fichier inconnu, clé mal
 * formée, compagnie supprimée ou fichier absent du stockage ne se distinguent pas.
 */
const publicLogoRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { file: string } }>('/logos/:file', async (req, reply) => {
    const notFound = () => sendPublicError(reply, 404, 'logo_not_found')
    const params = logoParamsSchema.safeParse(req.params)
    const key = params.success ? `logos/${params.data.file}` : null

    if (!isValidMediaKey(key)) {
      return notFound()
    }

    const company = await db('companies')
      .where('logo_key', key)
      .whereNot('status', COMPANY_STATUS_DELETED)
      .first('logo_mime_type')

    if (!company?.logo_mime_type) {
      return notFound()
    }

    const file = await getMediaStorage().read(key)

    if (!file) {
      req.log.error('company logo file missing from storage')

      return notFound()
    }

    return reply
      .header('Cache-Control', LOGO_CACHE_CONTROL)
      .header('Content-Type', company.logo_mime_type)
      .header('Content-Length', String(file.size))
      .header('X-Content-Type-Options', 'nosniff')
      .send(file.stream)
  })
}

export default publicLogoRoutes
