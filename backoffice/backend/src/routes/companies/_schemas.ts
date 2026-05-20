import { z } from 'zod'

import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
  ADMIN_STATUS_INACTIVE,
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'

export const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const companyAdminParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

export const adminParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  adminId: z.coerce.number().int().positive(),
})

const companyStatusSchema = z.union([
  z.literal(COMPANY_STATUS_INACTIVE),
  z.literal(COMPANY_STATUS_ACTIVE),
  z.literal(COMPANY_STATUS_DELETED),
])

const adminStatusSchema = z.union([
  z.literal(ADMIN_STATUS_INACTIVE),
  z.literal(ADMIN_STATUS_ACTIVE),
  z.literal(ADMIN_STATUS_DELETED),
])

export const adminRoleSchema = z.enum([
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_USER,
])

export const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
})

export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    status: companyStatusSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.email !== undefined || body.status !== undefined, {
    message: 'empty_body',
  })

export const updateCompanyStatusSchema = z.object({
  status: companyStatusSchema,
})

export const updateAdminStatusSchema = z.object({
  status: adminStatusSchema,
})

export const createAdminSchema = z.object({
  firstname: z.string().trim().max(255).optional().nullable(),
  lastname: z.string().trim().max(255).optional().nullable(),
  username: z.string().trim().min(3).max(255),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(100),
  role: adminRoleSchema.optional(),
})

export const updateAdminSchema = z
  .object({
    role: adminRoleSchema.optional(),
    firstname: z.string().trim().max(255).nullable().optional(),
    lastname: z.string().trim().max(255).nullable().optional(),
    username: z.string().trim().min(3).max(255).optional(),
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    password: z.string().min(8).max(100).optional(),
    status: adminStatusSchema.optional(),
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
