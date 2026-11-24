import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import { countUnusedRecoveryCodes, verifySecondFactor } from '../../security/adminTotp'
import { challengeCodeSchema } from './_schemas'
import { issueSession, readChallenge, replyTooManyAttempts, replyTotpUnavailable } from './_shared'

const loginTotpRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login/totp', async (req: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const parsed = challengeCodeSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten())

    const admin = await readChallenge(app, parsed.data.challengeToken)
    if (!admin) return reply.code(401).send({ error: 'mfa_challenge_invalid' })

    if (!app.totpKey) return replyTotpUnavailable(req, reply)

    const result = await verifySecondFactor(admin.id, parsed.data.code, app.totpKey, new Date())

    if (!result.ok) {
      if (result.reason === 'not_enrolled')
        return reply.code(409).send({ error: 'totp_not_enrolled' })
      if (result.reason === 'locked') return replyTooManyAttempts(reply, result.retryAfterSeconds)

      return reply.code(401).send({ error: 'totp_invalid' })
    }

    const session = await issueSession(app, admin)

    return result.recoveryCode
      ? { ...session, recoveryCodesRemaining: await countUnusedRecoveryCodes(admin.id) }
      : session
  })
}

export default loginTotpRoutes
