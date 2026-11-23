import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import { confirmEnrollment, getAdminTotp, startEnrollment } from '../../security/adminTotp'
import { openSecret, sealSecret } from '../../security/secretBox'
import { generateRecoveryCodes, generateSecret, otpauthUrl, verifyTotp } from '../../security/totp'
import { challengeSchema, confirmEnrollmentSchema } from './_schemas'
import { issueSession, readChallenge, replyTotpUnavailable } from './_shared'

/** Émetteur affiché dans l'application d'authentification ; le nom du produit n'est pas figé. */
const DEFAULT_TOTP_ISSUER = 'QuizzUp'

const loginEnrollRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/login/totp/enroll',
    async (req: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const parsed = challengeSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send(parsed.error.flatten())

      const admin = await readChallenge(app, parsed.data.challengeToken)
      if (!admin) return reply.code(401).send({ error: 'mfa_challenge_invalid' })

      if (!app.totpKey) return replyTotpUnavailable(req, reply)

      // Régénère le secret tant que l'enrôlement n'est pas confirmé ; jamais après.
      const secret = generateSecret()
      const started = await startEnrollment(admin.id, sealSecret(app.totpKey, admin.id, secret))
      if (!started) return reply.code(409).send({ error: 'totp_already_enrolled' })

      const issuer = process.env.TOTP_ISSUER?.trim() || DEFAULT_TOTP_ISSUER

      return { secret, otpauthUrl: otpauthUrl(secret, admin.username, issuer) }
    }
  )

  app.post(
    '/login/totp/enroll/confirm',
    async (req: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const parsed = confirmEnrollmentSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send(parsed.error.flatten())

      const admin = await readChallenge(app, parsed.data.challengeToken)
      if (!admin) return reply.code(401).send({ error: 'mfa_challenge_invalid' })

      if (!app.totpKey) return replyTotpUnavailable(req, reply)

      const record = await getAdminTotp(admin.id)
      if (!record) return reply.code(409).send({ error: 'totp_not_enrolled' })
      if (record.confirmedAt) return reply.code(409).send({ error: 'totp_already_enrolled' })

      const now = new Date()
      const step = verifyTotp(
        openSecret(app.totpKey, admin.id, record.secretEnc),
        parsed.data.code,
        now.getTime()
      )
      if (step === null) return reply.code(401).send({ error: 'totp_invalid' })

      const recoveryCodes = generateRecoveryCodes()
      const confirmed = await confirmEnrollment(
        admin.id,
        record.secretEnc,
        step,
        recoveryCodes,
        now
      )
      if (!confirmed) {
        // Refus : soit confirmé entre-temps, soit secret régénéré (le code vérifié ne vaut plus).
        const current = await getAdminTotp(admin.id)

        return reply.code(409).send({
          error: current?.confirmedAt ? 'totp_already_enrolled' : 'totp_enrollment_changed',
        })
      }

      return { ...(await issueSession(app, admin)), recoveryCodes }
    }
  )
}

export default loginEnrollRoutes
