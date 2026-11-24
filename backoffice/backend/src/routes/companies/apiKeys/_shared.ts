import type { ApiKey, ApiKeyStatus } from '@quizzup/shared'

import db from '../../../db'

/** Colonnes lues : jamais `key_hash`, que rien dans la réponse ne doit pouvoir exposer. */
export const apiKeySelect = [
  'id',
  'name',
  'key_prefix',
  'status',
  'created_at',
  'last_used_at',
  'deleted_at',
  'created_by_admin_id',
] as const

export type ApiKeyDbRow = {
  id: number
  name: string
  key_prefix: string
  status: number
  created_at: Date | string
  last_used_at: Date | string | null
  deleted_at: Date | string | null
  created_by_admin_id: number | null
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

/**
 * Met en forme des clés de la compagnie `companyId` lues avec `apiKeySelect`, et retrouve le nom de
 * leur créateur. Un créateur qui n'est pas un compte de la compagnie (superadmin de l'éditeur) n'est
 * pas nommé : `createdBy` vaut `null`.
 */
export async function toApiKeys(rows: ApiKeyDbRow[], companyId: number): Promise<ApiKey[]> {
  const adminIds = [
    ...new Set(
      rows.map((row) => row.created_by_admin_id).filter((id): id is number => id !== null)
    ),
  ]
  const admins =
    adminIds.length > 0
      ? ((await db('admins')
          .whereIn('id', adminIds)
          .where('company_id', companyId)
          .select('id', 'username')) as Array<{
          id: number
          username: string
        }>)
      : []
  const usernames = new Map(admins.map((admin) => [Number(admin.id), admin.username]))

  return rows.map((row) => {
    const username =
      row.created_by_admin_id === null ? undefined : usernames.get(Number(row.created_by_admin_id))

    return {
      id: Number(row.id),
      name: row.name,
      keyPrefix: row.key_prefix,
      status: Number(row.status) as ApiKeyStatus,
      createdAt: toIso(row.created_at),
      lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null,
      revokedAt: row.deleted_at ? toIso(row.deleted_at) : null,
      createdBy: username === undefined ? null : { id: Number(row.created_by_admin_id), username },
    }
  })
}
