import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

import {
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
  ADMIN_STATUS_INACTIVE,
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import db from '../db'
import type { AdminRow, AdminStatusUpdateBody } from '../types/admin'
import type {
  CompanyCreateBody,
  CompanyRow,
  CompanyStatusUpdateBody,
  CompanyUpdateBody,
} from '../types/company'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

const adminParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  adminId: z.coerce.number().int().positive(),
})

const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
})

const updateCompanySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    status: z
      .union([
        z.literal(COMPANY_STATUS_INACTIVE),
        z.literal(COMPANY_STATUS_ACTIVE),
        z.literal(COMPANY_STATUS_DELETED),
      ])
      .optional(),
  })
  .refine((body) => body.name !== undefined || body.email !== undefined || body.status !== undefined, {
    message: 'empty_body',
  })

const updateCompanyStatusSchema = z.object({
  status: z.union([
    z.literal(COMPANY_STATUS_INACTIVE),
    z.literal(COMPANY_STATUS_ACTIVE),
    z.literal(COMPANY_STATUS_DELETED),
  ]),
})

const updateAdminStatusSchema = z.object({
  status: z.union([
    z.literal(ADMIN_STATUS_ACTIVE),
    z.literal(ADMIN_STATUS_INACTIVE),
    z.literal(ADMIN_STATUS_DELETED),
  ]),
})

const createAdminSchema = z.object({
  role: z.string().trim().min(2).max(50),
  firstname: z.string().trim().max(255).nullable().optional(),
  lastname: z.string().trim().max(255).nullable().optional(),
  username: z.string().trim().min(3).max(255),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(100),
})

const updateAdminSchema = z
  .object({
    role: z.string().trim().min(2).max(50).optional(),
    firstname: z.string().trim().max(255).nullable().optional(),
    lastname: z.string().trim().max(255).nullable().optional(),
    username: z.string().trim().min(3).max(255).optional(),
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    password: z.string().min(8).max(100).optional(),
    status: z
      .union([
        z.literal(ADMIN_STATUS_INACTIVE),
        z.literal(ADMIN_STATUS_ACTIVE),
        z.literal(ADMIN_STATUS_DELETED),
      ])
      .optional(),
  })
  .refine(
    (body) =>
      body.role !== undefined ||
      body.firstname !== undefined ||
      body.lastname !== undefined ||
      body.username !== undefined ||
      body.email !== undefined ||
      body.password !== undefined ||
      body.status !== undefined,
    {
      message: 'empty_body',
    },
  )

function normalizeNullableString(value: string | null | undefined): string | null {
  const normalized = value?.trim()

  return normalized ? normalized : null
}

const companySelect = [
  'companies.id',
  'companies.name',
  'companies.email',
  'companies.status',
  'companies.created_at as createdAt',
  'companies.updated_at as updatedAt',
  'companies.deleted_at as deletedAt',
  db.raw('COUNT(admins.id)::int as "accountsCount"'),
]

const adminSelect = [
  'id',
  'company_id as companyId',
  'role',
  'firstname',
  'lastname',
  'username',
  'email',
  'status',
  'created_at as createdAt',
  'updated_at as updatedAt',
  'deleted_at as deletedAt',
]

async function getCompanyAdminsCount(companyId: number): Promise<number> {
  const adminsCount = await db('admins')
    .where('company_id', companyId)
    .whereNot('status', ADMIN_STATUS_DELETED)
    .count<{ count: string }>('id as count')
    .first()

  return Number(adminsCount?.count ?? 0)
}

async function ensureCanAccessCompany(
  req: FastifyRequest,
  reply: FastifyReply,
  companyId: number,
): Promise<boolean> {
  const mycompanyId = Number(req.user.company_id)
  const isAdmin = req.user.role === 'admin'

  if (!isAdmin && companyId !== mycompanyId) {
    reply.code(403).send({ error: 'forbidden' })
    return false
  }

  return true
}

async function findCompanyById(companyId: number) {
  return db('companies').where('id', companyId).first('id', 'status')
}

async function findAdminInCompany(companyId: number, adminId: number) {
  return db('admins').where('company_id', companyId).where('id', adminId).first('id', 'status')
}

async function getAdminRow(companyId: number, adminId: number): Promise<AdminRow | null> {
  const admin = await db('admins')
    .where('company_id', companyId)
    .where('id', adminId)
    .first(adminSelect)

  return admin ? (admin as AdminRow) : null
}

const companiesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, _reply: FastifyReply) => {
      const mycompanyId = Number(req.user.company_id)
      const isAdmin = req.user.role === 'admin'

      const baseQuery = db('companies')
        .leftJoin('admins', function joinAdmins() {
          this.on('admins.company_id', '=', 'companies.id').andOn(
            db.raw('admins.status <> ?', [ADMIN_STATUS_DELETED]),
          )
        })
        .groupBy('companies.id')
        .select(companySelect)

      if (!isAdmin) {
        const company = await baseQuery
          .where('companies.id', mycompanyId)
          .whereNot('companies.status', COMPANY_STATUS_DELETED)
          .first()

        if (!company) {
          return { companies: [] }
        }

        return { companies: [company as CompanyRow] }
      }

      const companies = await baseQuery.orderBy('companies.id', 'asc')

      return { companies: companies as CompanyRow[] }
    },
  )

  app.get(
    '/companies/:id',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = paramsSchema.safeParse(req.params)

      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { id } = parsed.data

      const canAccess = await ensureCanAccessCompany(req, reply, id)

      if (!canAccess) {
        return
      }

      const company = await db('companies')
        .leftJoin('admins', function joinAdmins() {
          this.on('admins.company_id', '=', 'companies.id').andOn(
            db.raw('admins.status <> ?', [ADMIN_STATUS_DELETED]),
          )
        })
        .where('companies.id', id)
        .groupBy('companies.id')
        .select(companySelect)
        .first()

      if (!company) {
        return reply.code(404).send({ error: 'not_found' })
      }

      return { company: company as CompanyRow }
    },
  )

  app.get(
    '/companies/:id/admins',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = paramsSchema.safeParse(req.params)

      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { id } = parsed.data

      const canAccess = await ensureCanAccessCompany(req, reply, id)

      if (!canAccess) {
        return
      }

      const company = await findCompanyById(id)

      if (!company) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const accounts = await db('admins')
        .where('company_id', id)
        .select(adminSelect)
        .orderBy('id', 'asc')

      return {
        accounts: accounts as AdminRow[],
      }
    },
  )

  app.post<{ Body: CompanyCreateBody }>(
    '/companies',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsed = createCompanySchema.safeParse(req.body)

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsed.error.flatten(),
        })
      }

      const { name, email } = parsed.data

      const existingCompanyByEmail = await db('companies')
        .whereRaw('LOWER(email) = ?', [email])
        .first('id')

      if (existingCompanyByEmail) {
        return reply.code(409).send({ error: 'email_already_exists' })
      }

      const existingCompanyByName = await db('companies')
        .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
        .first('id')

      if (existingCompanyByName) {
        return reply.code(409).send({ error: 'name_already_exists' })
      }

      const inserted = await db('companies')
        .insert({
          name,
          email,
          status: COMPANY_STATUS_ACTIVE,
          deleted_at: null,
        })
        .returning([
          'id',
          'name',
          'email',
          'status',
          'created_at as createdAt',
          'updated_at as updatedAt',
          'deleted_at as deletedAt',
        ])

      const createdCompany = Array.isArray(inserted) ? inserted[0] : inserted

      return reply.code(201).send({
        company: {
          ...createdCompany,
          accountsCount: 0,
        } satisfies CompanyRow,
      })
    },
  )

  app.patch<{ Body: CompanyUpdateBody }>(
    '/companies/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedParams = paramsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = updateCompanySchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { id } = parsedParams.data
      const { name, email, status } = parsedBody.data

      const existingCompany = await findCompanyById(id)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (email) {
        const existingCompanyByEmail = await db('companies')
          .whereRaw('LOWER(email) = ?', [email])
          .whereNot('id', id)
          .first('id')

        if (existingCompanyByEmail) {
          return reply.code(409).send({ error: 'email_already_exists' })
        }
      }

      if (name) {
        const existingCompanyByName = await db('companies')
          .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
          .whereNot('id', id)
          .first('id')

        if (existingCompanyByName) {
          return reply.code(409).send({ error: 'name_already_exists' })
        }
      }

      const updatePayload: Record<string, unknown> = {
        updated_at: db.fn.now(),
      }

      if (name !== undefined) {
        updatePayload.name = name
      }

      if (email !== undefined) {
        updatePayload.email = email
      }

      if (status !== undefined) {
        updatePayload.status = status
        updatePayload.deleted_at = status === COMPANY_STATUS_DELETED ? db.fn.now() : null
      }

      const updated = await db('companies')
        .where('id', id)
        .update(updatePayload)
        .returning([
          'id',
          'name',
          'email',
          'status',
          'created_at as createdAt',
          'updated_at as updatedAt',
          'deleted_at as deletedAt',
        ])

      const updatedCompanyBase = Array.isArray(updated) ? updated[0] : updated
      const accountsCount = await getCompanyAdminsCount(id)

      return reply.code(200).send({
        company: {
          ...updatedCompanyBase,
          accountsCount,
        } satisfies CompanyRow,
      })
    },
  )

  app.patch<{ Body: CompanyStatusUpdateBody }>(
    '/companies/:id/status',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedParams = paramsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = updateCompanyStatusSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { id } = parsedParams.data
      const { status } = parsedBody.data

      const existingCompany = await findCompanyById(id)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const updated = await db('companies')
        .where('id', id)
        .update({
          status,
          updated_at: db.fn.now(),
          deleted_at: status === COMPANY_STATUS_DELETED ? db.fn.now() : null,
        })
        .returning([
          'id',
          'name',
          'email',
          'status',
          'created_at as createdAt',
          'updated_at as updatedAt',
          'deleted_at as deletedAt',
        ])

      const updatedCompanyBase = Array.isArray(updated) ? updated[0] : updated
      const accountsCount = await getCompanyAdminsCount(id)

      return reply.code(200).send({
        company: {
          ...updatedCompanyBase,
          accountsCount,
        } satisfies CompanyRow,
      })
    },
  )

  app.patch<{ Body: AdminStatusUpdateBody }>(
    '/companies/:companyId/admins/:adminId/status',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedParams = adminParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = updateAdminStatusSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId, adminId } = parsedParams.data
      const { status } = parsedBody.data

      const existingCompany = await findCompanyById(companyId)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const existingAdmin = await findAdminInCompany(companyId, adminId)

      if (!existingAdmin) {
        return reply.code(404).send({ error: 'not_found' })
      }

      await db('admins')
        .where('company_id', companyId)
        .where('id', adminId)
        .update({
          status,
          updated_at: db.fn.now(),
          deleted_at: status === ADMIN_STATUS_DELETED ? db.fn.now() : null,
        })

      const account = await getAdminRow(companyId, adminId)

      return reply.code(200).send({
        account,
      })
    },
  )

  app.delete(
    '/companies/:companyId/admins/:adminId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedParams = adminParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId, adminId } = parsedParams.data

      const existingCompany = await findCompanyById(companyId)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const existingAdmin = await findAdminInCompany(companyId, adminId)

      if (!existingAdmin) {
        return reply.code(404).send({ error: 'not_found' })
      }

      await db('admins')
        .where('company_id', companyId)
        .where('id', adminId)
        .update({
          status: ADMIN_STATUS_DELETED,
          updated_at: db.fn.now(),
          deleted_at: db.fn.now(),
        })

      const account = await getAdminRow(companyId, adminId)

      return reply.code(200).send({
        account,
      })
    },
  )

  app.delete(
    '/companies/:id/permanent',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsed = paramsSchema.safeParse(req.params)

      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { id } = parsed.data

      const existingCompany = await findCompanyById(id)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (existingCompany.status === COMPANY_STATUS_DELETED) {
        return reply.code(200).send({
          success: true,
          deleted: {
            companyId: id,
            adminsCount: 0,
            companiesCount: 0,
          },
        })
      }

      const updatedCompanies = await db('companies')
        .where('id', id)
        .update({
          status: COMPANY_STATUS_DELETED,
          updated_at: db.fn.now(),
          deleted_at: db.fn.now(),
        })

      return reply.code(200).send({
        success: true,
        deleted: {
          companyId: id,
          adminsCount: 0,
          companiesCount: updatedCompanies,
        },
      })
    },
  )

  app.get(
    '/companies/:companyId/admins/:adminId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedParams = adminParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId, adminId } = parsedParams.data

      const existingCompany = await findCompanyById(companyId)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const account = await getAdminRow(companyId, adminId)

      if (!account) {
        return reply.code(404).send({ error: 'not_found' })
      }

      return reply.code(200).send({
        account,
      })
    },
  )

  app.post(
    '/companies/:companyId/admins',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedParams = z
        .object({
          companyId: z.coerce.number().int().positive(),
        })
        .safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = createAdminSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId } = parsedParams.data
      const { role, firstname, lastname, username, email, password } = parsedBody.data

      const existingCompany = await findCompanyById(companyId)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const existingAdminByEmail = await db('admins')
        .whereRaw('LOWER(email) = ?', [email])
        .whereNot('status', ADMIN_STATUS_DELETED)
        .first('id')

      if (existingAdminByEmail) {
        return reply.code(409).send({ error: 'email_already_exists' })
      }

      const existingAdminByUsername = await db('admins')
        .whereRaw('LOWER(username) = ?', [username.toLowerCase()])
        .whereNot('status', ADMIN_STATUS_DELETED)
        .first('id')

      if (existingAdminByUsername) {
        return reply.code(409).send({ error: 'username_already_exists' })
      }

      const passwordHash = await bcrypt.hash(password, 12)

      const inserted = await db('admins')
        .insert({
          company_id: companyId,
          role,
          firstname: normalizeNullableString(firstname),
          lastname: normalizeNullableString(lastname),
          username,
          email,
          mdp_hash: passwordHash,
          status: ADMIN_STATUS_ACTIVE,
          deleted_at: null,
        })
        .returning('id')

      const insertedAdmin = Array.isArray(inserted) ? inserted[0] : inserted
      const adminId = Number(typeof insertedAdmin === 'object' ? insertedAdmin.id : insertedAdmin)

      const account = await getAdminRow(companyId, adminId)

      return reply.code(201).send({
        account,
      })
    },
  )

  app.patch(
    '/companies/:companyId/admins/:adminId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedParams = adminParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = updateAdminSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId, adminId } = parsedParams.data
      const { role, firstname, lastname, username, email, password, status } = parsedBody.data

      const existingCompany = await findCompanyById(companyId)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const existingAdmin = await findAdminInCompany(companyId, adminId)

      if (!existingAdmin) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (email) {
        const existingAdminByEmail = await db('admins')
          .whereRaw('LOWER(email) = ?', [email])
          .whereNot('id', adminId)
          .whereNot('status', ADMIN_STATUS_DELETED)
          .first('id')

        if (existingAdminByEmail) {
          return reply.code(409).send({ error: 'email_already_exists' })
        }
      }

      if (username) {
        const existingAdminByUsername = await db('admins')
          .whereRaw('LOWER(username) = ?', [username.toLowerCase()])
          .whereNot('id', adminId)
          .whereNot('status', ADMIN_STATUS_DELETED)
          .first('id')

        if (existingAdminByUsername) {
          return reply.code(409).send({ error: 'username_already_exists' })
        }
      }

      const updatePayload: Record<string, unknown> = {
        updated_at: db.fn.now(),
      }

      if (role !== undefined) {
        updatePayload.role = role
      }

      if (firstname !== undefined) {
        updatePayload.firstname = normalizeNullableString(firstname)
      }

      if (lastname !== undefined) {
        updatePayload.lastname = normalizeNullableString(lastname)
      }

      if (username !== undefined) {
        updatePayload.username = username
      }

      if (email !== undefined) {
        updatePayload.email = email
      }

      if (password !== undefined) {
        updatePayload.mdp_hash = await bcrypt.hash(password, 12)
      }

      if (status !== undefined) {
        updatePayload.status = status
        updatePayload.deleted_at = status === ADMIN_STATUS_DELETED ? db.fn.now() : null
      }

      await db('admins')
        .where('company_id', companyId)
        .where('id', adminId)
        .update(updatePayload)

      const account = await getAdminRow(companyId, adminId)

      return reply.code(200).send({
        account,
      })
    },
  )
}

export default companiesRoutes
