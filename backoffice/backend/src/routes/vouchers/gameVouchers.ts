import {
  COMPANY_STATUS_DELETED,
  GAME_STATE_FINISHED,
  GAME_STATUS_DELETED,
  VOUCHER_STATUS_ACTIVE,
} from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'

import db from '../../db'
import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { getCurrentAdminId } from '../_shared/adminContext'
import { isUniqueViolation } from '../_shared/dbErrors'
import { gameVouchersParamsSchema, issueVoucherSchema } from './_schemas'
import {
  findVoucherById,
  generateVoucherCode,
  toVoucherRow,
  VOUCHER_ISSUED_CONSTRAINT,
  voucherQuery,
  voucherSelect,
  withVoucherQr,
} from './_shared'

const DAY_MS = 24 * 60 * 60 * 1000

/** Tirages de code avant d'abandonner : une collision sur 40 bits n'arrive pas, deux de suite non plus. */
const CODE_ATTEMPTS = 3

/** Bons d'une partie : émission par le personnel (un clic par pupitre) et liste pour la feuille. */
const gameVouchersRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/companies/:companyId/games/:gameId/vouchers',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.VOUCHER,
        API_ACTION.CREATE
      )

      if (!hasPermission) {
        return
      }

      const parsedParams = gameVouchersParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = issueVoucherSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() })
      }

      const { companyId, gameId } = parsedParams.data
      const { participantId } = parsedBody.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const company = await db('companies')
        .where('id', companyId)
        .first('status', 'voucher_label', 'voucher_validity_days')

      if (!company || company.status === COMPANY_STATUS_DELETED) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const game = await db('games')
        .where({ id: gameId, company_id: companyId })
        .whereNot('status', GAME_STATUS_DELETED)
        .first('state')

      if (!game) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (!company.voucher_label) {
        return reply.code(409).send({ error: 'vouchers_disabled' })
      }

      if (game.state !== GAME_STATE_FINISHED) {
        return reply.code(409).send({ error: 'game_not_finished' })
      }

      const participant = await db('game_participants')
        .where({ id: participantId, game_id: gameId })
        .first('id')

      if (!participant) {
        return reply.code(404).send({ error: 'participant_not_found' })
      }

      const now = new Date()
      let voucherId: number | null = null

      for (let attempt = 0; attempt < CODE_ATTEMPTS && voucherId === null; attempt += 1) {
        try {
          const [inserted] = await db('vouchers')
            .insert({
              company_id: companyId,
              game_id: gameId,
              participant_id: participantId,
              code: generateVoucherCode(),
              label: company.voucher_label,
              expires_at: new Date(now.getTime() + company.voucher_validity_days * DAY_MS),
              created_by: getCurrentAdminId(req),
              status: VOUCHER_STATUS_ACTIVE,
            })
            .returning('id')

          voucherId = Number(inserted.id)
        } catch (error) {
          if (!isUniqueViolation(error)) {
            throw error
          }

          // Pupitre déjà servi ; toute autre collision est celle du code : on tire un autre code.
          if ((error as { constraint?: string }).constraint === VOUCHER_ISSUED_CONSTRAINT) {
            return reply.code(409).send({ error: 'voucher_already_issued' })
          }
        }
      }

      if (voucherId === null) {
        throw new Error('voucher code collision')
      }

      const voucher = await findVoucherById(companyId, voucherId)

      return reply.code(201).send({ voucher: voucher && withVoucherQr(voucher) })
    }
  )

  app.get(
    '/companies/:companyId/games/:gameId/vouchers',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.VOUCHER, API_ACTION.LIST)

      if (!hasPermission) {
        return
      }

      const parsedParams = gameVouchersParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId, gameId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const game = await db('games')
        .where({ id: gameId, company_id: companyId })
        .whereNot('status', GAME_STATUS_DELETED)
        .first('id')

      if (!game) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const rows = await voucherQuery()
        .where('vouchers.company_id', companyId)
        .where('vouchers.game_id', gameId)
        .orderBy('game_participants.podium', 'asc')
        .select(voucherSelect)

      const now = new Date()

      return { vouchers: rows.map((row) => withVoucherQr(toVoucherRow(row, now))) }
    }
  )
}

export default gameVouchersRoutes
