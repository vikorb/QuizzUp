import { PassThrough } from 'node:stream'

import type { FastifyReply, FastifyRequest } from 'fastify'

import { ADMIN_ROLE_ROOM, LIVE_EVENT, LIVE_HEARTBEAT_MS, type LiveEvent } from '@quizzup/shared'
import type { LiveSink } from '../../live/hub'
import { checkSession } from '../../plugins/auth'

const SESSION_CHECK_EVERY_MS = 60_000

// Plafond du tampon d'écriture d'un flux. Un poste en veille ou une connexion à moitié ouverte ne
// lit plus : au-delà de 1 Mio en attente, on ferme le flux plutôt que de laisser la mémoire grossir.
// Le client se reconnectera.
const MAX_BUFFERED_BYTES = 1024 * 1024

/**
 * Prépare un flux SSE sur la réponse : en-têtes, ligne `: ping` régulière, revérification de la
 * session (sans la prolonger) et nettoyage complet quand le client coupe. L'appelant fait
 * `reply.send(sse.stream)`. Pas de `reply.hijack()` : CORS et les en-têtes de Fastify restent.
 */
export function openSseStream(
  req: FastifyRequest,
  reply: FastifyReply,
  onClose: () => void
): LiveSink & { stream: PassThrough } {
  const stream = new PassThrough()
  const { sid } = req.user
  const adminId = Number(req.user.sub)
  const isRoomSession = req.user.role === ADMIN_ROLE_ROOM
  let closed = false

  const write = (text: string) => {
    if (closed) {
      return
    }

    if (stream.writableLength > MAX_BUFFERED_BYTES) {
      close()
      return
    }

    stream.write(text)
  }
  const send = (event: LiveEvent, data: unknown) =>
    write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  const close = () => {
    if (closed) {
      return
    }

    closed = true
    clearInterval(pingTimer)
    clearInterval(sessionTimer)
    onClose()

    if (!stream.destroyed) {
      stream.end()
    }
  }

  const pingTimer = setInterval(() => write(': ping\n\n'), LIVE_HEARTBEAT_MS)
  const sessionTimer = setInterval(() => {
    checkSession(sid, adminId, isRoomSession)
      .then((check) => {
        if (!check.ok) {
          send(LIVE_EVENT.SESSION_ENDED, { error: check.error })
          close()
        }
      })
      // Base momentanément indisponible : le flux reste ouvert, on réessaie au prochain passage.
      .catch((error: unknown) => req.log.warn({ err: error }, 'live stream session check failed'))
  }, SESSION_CHECK_EVERY_MS)

  // Deux écouteurs : si le client a coupé avant la fin du handler, `reply.raw` a déjà émis `close`
  // et seul le flux, détruit par Fastify à l'envoi de la réponse, le signale encore.
  reply.raw.on('close', close)
  stream.on('close', close)
  reply
    .header('Content-Type', 'text/event-stream')
    .header('Cache-Control', 'no-cache, no-transform')
    .header('X-Accel-Buffering', 'no')

  return { stream, send, close }
}
