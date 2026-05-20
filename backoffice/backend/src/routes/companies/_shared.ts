import { ADMIN_STATUS_DELETED } from '@quizzup/shared'

import db from '../../db'
import type { AdminAccessRow } from '../../security/companiesPolicy'
import type { AdminRow } from '../../types/admin'

export function normalizeNullableString(value: string | null | undefined): string | null {
  const normalized = value?.trim()

  return normalized ? normalized : null
}

export const companySelect = [
  'companies.id',
  'companies.name',
  'companies.email',
  'companies.status',
  'companies.created_at as createdAt',
  'companies.updated_at as updatedAt',
  'companies.deleted_at as deletedAt',
  db.raw('COUNT(admins.id)::int as "accountsCount"'),
]

export const adminSelect = [
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

export async function getCompanyAdminsCount(companyId: number): Promise<number> {
  const adminsCount = await db('admins')
    .where('company_id', companyId)
    .whereNot('status', ADMIN_STATUS_DELETED)
    .count<{ count: string }>('id as count')
    .first()

  return Number(adminsCount?.count ?? 0)
}

export async function findCompanyById(companyId: number) {
  return db('companies').where('id', companyId).first('id', 'status')
}

export async function findAdminInCompany(
  companyId: number,
  adminId: number,
): Promise<AdminAccessRow | null> {
  const admin = await db('admins')
    .where('company_id', companyId)
    .where('id', adminId)
    .first('id', 'role', 'status')

  return admin ? (admin as AdminAccessRow) : null
}

export async function getAdminRow(companyId: number, adminId: number): Promise<AdminRow | null> {
  const admin = await db('admins')
    .where('company_id', companyId)
    .where('id', adminId)
    .first(adminSelect)

  return admin ? (admin as AdminRow) : null
}
