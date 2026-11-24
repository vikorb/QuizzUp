import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import { resetAdminTotp, verifySecondFactor } from '../../security/adminTotp'
import { isSuperadmin } from '../../security/companiesPolicy'
import { codeSchema } from '../login/_schemas'
import { replyTooManyAttempts, replyTotpUnavailable } from '../login/_shared'

const meTotpRoutes: FastifyPluginAsync = async (app) => {
  // Réinitialise le deuxième facteur : efface secret et codes de secours, révoque toutes les sessions
  // de l'admin (la sienne comprise). Le code redemandé prouve que celui qui appelle tient encore le
  // téléphone ou un code de secours ; le prochain login repasse par l'enrôlement.
  app.delete(
    '/me/totp',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      if (!isSuperadmin(req)) return reply.code(403).send({ error: 'forbidden' })

      const parsed = codeSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send(parsed.error.flatten())

      if (!app.totpKey) return replyTotpUnavailable(req, reply)

      const adminId = Number(req.user.sub)
      const result = await verifySecondFactor(adminId, parsed.data.code, app.totpKey, new Date())

      if (!result.ok) {
        if (result.reason === 'not_enrolled')
          return reply.code(409).send({ error: 'totp_not_enrolled' })
        if (result.reason === 'locked') return replyTooManyAttempts(reply, result.retryAfterSeconds)

        return reply.code(401).send({ error: 'totp_invalid' })
      }

      await resetAdminTotp(adminId)

      return reply.code(204).send()
    }
  )
}

export default meTotpRoutes
