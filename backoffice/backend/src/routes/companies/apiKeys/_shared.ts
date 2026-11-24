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
  'created_by_admin_id',
] as const

export type ApiKeyDbRow = {
  id: number
  name: string
  key_prefix: string
  status: number
  created_at: Date | string
  last_used_at: Date | string | null
  created_by_admin_id: number | null
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

/** Met en forme des clés lues avec `apiKeySelect`, et retrouve le nom de leur créateur. */
export async function toApiKeys(rows: ApiKeyDbRow[]): Promise<ApiKey[]> {
  const adminIds = [
    ...new Set(
      rows.map((row) => row.created_by_admin_id).filter((id): id is number => id !== null)
    ),
  ]
  const admins =
    adminIds.length > 0
      ? ((await db('admins').whereIn('id', adminIds).select('id', 'username')) as Array<{
          id: number
          username: string
        }>)
      : []
  const usernames = new Map(admins.map((admin) => [Number(admin.id), admin.username]))

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    keyPrefix: row.key_prefix,
    status: Number(row.status) as ApiKeyStatus,
    createdAt: toIso(row.created_at),
    lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null,
    createdBy:
      row.created_by_admin_id === null
        ? null
        : {
            id: Number(row.created_by_admin_id),
            username: usernames.get(Number(row.created_by_admin_id)) ?? '',
          },
  }))
}
