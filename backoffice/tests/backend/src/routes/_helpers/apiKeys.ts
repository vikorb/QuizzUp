import { API_KEY_STATUS_ACTIVE } from '@quizzup/shared'

import { dbState } from './mockDb'
import type { TestUser } from './testApp'

let nextSeed = 1

/** Ligne `api_keys` valide ; `key_hash` et `key_prefix` sont uniques d'un appel à l'autre. */
export function seedApiKey(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const seed = nextSeed++
  const row = {
    id: dbState.api_keys.length + 1,
    company_id: 1,
    name: `Clé ${seed}`,
    key_prefix: `qzk_${String(seed).padStart(8, '0')}`,
    key_hash: String(seed).padStart(64, 'a'),
    created_by_admin_id: 2,
    last_used_at: null,
    status: API_KEY_STATUS_ACTIVE,
    created_at: '2026-11-20T10:00:00.000Z',
    updated_at: null,
    deleted_at: null,
    ...overrides,
  }

  dbState.api_keys.push(row)

  return row
}

/** Admin de la compagnie 2 : « le client B » des tests d'isolation (A = compagnie 1). */
export const otherCompanyAdmin = {
  sub: '20',
  id: 20,
  adminId: 20,
  company_id: 2,
  companyId: 2,
  role: 'admin',
  sid: 'sid-other',
} as TestUser

/** Compte `user` de la compagnie 1 : ne doit avoir aucun accès aux clés ni au journal. */
export const staffUserOfCompany1 = {
  sub: '30',
  id: 30,
  adminId: 30,
  company_id: 1,
  companyId: 1,
  role: 'user',
  sid: 'sid-staff',
} as TestUser
