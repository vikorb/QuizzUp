import fs from 'node:fs'
import type { FastifyPluginAsync } from 'fastify'

import { PUBLIC_OPENAPI_FILE, resolveApiDocPath } from '../../utils/apiDocPath'

/**
 * `GET /public/v1/openapi.yaml` : le contrat de l'API publique (`docs/api/public-v1.yaml`), sans
 * authentification ni journal d'appel, sous la limite par adresse du préfixe. Lu une fois au
 * démarrage ; fichier introuvable = le serveur ne démarre pas.
 */
const publicOpenApiRoutes: FastifyPluginAsync = async (app) => {
  const contract = fs.readFileSync(resolveApiDocPath(PUBLIC_OPENAPI_FILE), 'utf8')

  app.get('/openapi.yaml', async (_req, reply) =>
    reply.header('Content-Type', 'application/yaml; charset=utf-8').send(contract)
  )
}

export default publicOpenApiRoutes
