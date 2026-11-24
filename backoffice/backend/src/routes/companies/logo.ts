import {
  COMPANY_LOGO_EXTENSIONS,
  COMPANY_LOGO_MAX_BYTES,
  COMPANY_STATUS_DELETED,
} from '@quizzup/shared'
import type { FastifyError, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import db from '../../db'
import { canUpdateCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { detectLogoMimeType } from '../../storage/logoFile'
import { buildCompanyLogoKey, getMediaStorage } from '../../storage/mediaStorage'
import { removeStoredMediaFile } from '../_shared/storedMedia'
import { companyAdminParamsSchema } from './_schemas'
import { companyLogoUrl, findCompanyById } from './_shared'

type LogoOutcome = { found: false } | { found: true; previousKey: string | null }

const companyLogoRoutes: FastifyPluginAsync = async (app) => {
  // Corps binaire brut (`fetch(url, { body: file })`), quel que soit le `Content-Type` annoncé :
  // le type se lit sur les octets, jamais sur l'en-tête. Le parseur n'existe que dans ce plugin.
  app.addContentTypeParser(
    '*',
    { parseAs: 'buffer', bodyLimit: COMPANY_LOGO_MAX_BYTES },
    (_req, body, done) => {
      done(null, body)
    }
  )

  app.setErrorHandler((error: FastifyError, _req, reply) => {
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({ error: 'logo_too_large' })
    }

    return reply.send(error)
  })

  /** Droit, identifiant et compagnie vérifiés avant tout : renvoie l'id, ou répond et renvoie null. */
  async function resolveCompany(req: FastifyRequest, reply: FastifyReply): Promise<number | null> {
    if (!requireApiPermission(req, reply, API_RESOURCE.COMPANY, API_ACTION.UPDATE)) {
      return null
    }

    const parsed = companyAdminParamsSchema.safeParse(req.params)

    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_params' })
      return null
    }

    const { companyId } = parsed.data

    if (!canUpdateCompanyContext(req, companyId)) {
      reply.code(403).send({ error: 'forbidden' })
      return null
    }

    const company = await findCompanyById(companyId)

    if (!company || company.status === COMPANY_STATUS_DELETED) {
      reply.code(404).send({ error: 'not_found' })
      return null
    }

    return companyId
  }

  app.put<{ Params: { companyId: string }; Body: Buffer }>(
    '/companies/:companyId/logo',
    // Authentification avant la lecture du corps (512 Ko en mémoire).
    { onRequest: [app.authenticate], bodyLimit: COMPANY_LOGO_MAX_BYTES },
    async (req, reply) => {
      const companyId = await resolveCompany(req, reply)

      if (companyId === null) {
        return
      }

      const content = req.body
      const mimeType = Buffer.isBuffer(content) ? detectLogoMimeType(content) : null

      if (!mimeType) {
        return reply.code(400).send({ error: 'logo_type_invalid' })
      }

      const key = buildCompanyLogoKey(COMPANY_LOGO_EXTENSIONS[mimeType])

      await getMediaStorage().save(key, content)

      let outcome: LogoOutcome

      try {
        // Ligne verrouillée : deux envois (ou un envoi et un retrait) simultanés voient chacun
        // la vraie clé remplacée, aucun fichier ne reste orphelin.
        outcome = await db.transaction(async (trx): Promise<LogoOutcome> => {
          const previous = await trx('companies')
            .where({ id: companyId })
            .forUpdate()
            .first('status', 'logo_key')

          // Compagnie supprimée pendant l'écriture du fichier.
          if (!previous || previous.status === COMPANY_STATUS_DELETED) {
            return { found: false }
          }

          await trx('companies').where({ id: companyId }).update({
            logo_key: key,
            logo_mime_type: mimeType,
            logo_updated_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          })

          return { found: true, previousKey: previous.logo_key ?? null }
        })
      } catch (error) {
        // Fichier écrit avant le verrou (pas d'écriture disque dans une transaction) : on le retire.
        await removeStoredMediaFile(req, key)

        throw error
      }

      if (!outcome.found) {
        await removeStoredMediaFile(req, key)

        return reply.code(404).send({ error: 'not_found' })
      }

      await removeStoredMediaFile(req, outcome.previousKey)

      return { logoUrl: companyLogoUrl(key) }
    }
  )

  app.delete<{ Params: { companyId: string } }>(
    '/companies/:companyId/logo',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const companyId = await resolveCompany(req, reply)

      if (companyId === null) {
        return
      }

      const outcome = await db.transaction(async (trx): Promise<LogoOutcome> => {
        const previous = await trx('companies')
          .where({ id: companyId })
          .forUpdate()
          .first('status', 'logo_key')

        if (!previous || previous.status === COMPANY_STATUS_DELETED) {
          return { found: false }
        }

        await trx('companies').where({ id: companyId }).update({
          logo_key: null,
          logo_mime_type: null,
          logo_updated_at: null,
          updated_at: trx.fn.now(),
        })

        return { found: true, previousKey: previous.logo_key ?? null }
      })

      if (!outcome.found) {
        return reply.code(404).send({ error: 'not_found' })
      }

      await removeStoredMediaFile(req, outcome.previousKey)

      return reply.code(204).send()
    }
  )
}

export default companyLogoRoutes
