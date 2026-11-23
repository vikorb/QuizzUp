import type { FastifyRequest } from 'fastify'

import { getMediaStorage, isValidMediaKey } from '../../storage/mediaStorage'

/** Suppression au mieux, après le commit : un fichier orphelin est journalisé, pas bloquant. */
export async function removeStoredMediaFile(
  req: FastifyRequest,
  key: string | null | undefined
): Promise<void> {
  if (!isValidMediaKey(key)) {
    return
  }

  try {
    await getMediaStorage().remove(key)
  } catch (error) {
    req.log.warn({ err: error, key }, 'media removal failed')
  }
}
