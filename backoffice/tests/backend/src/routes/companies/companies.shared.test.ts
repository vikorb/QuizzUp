import '../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_USER,
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
} from '@quizzup/shared'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import { getAdminRow, getCompanyAdminsCount, normalizeNullableString } from '@backend/routes/companies/_shared'
import { dbState, MOCK_NOW } from '../_helpers/mockDb'

resetRouteMocksBeforeEach()

describe('routes/companies/_shared.ts', () => {
  it('normalizes optional strings to null when they are empty', () => {
    expect(normalizeNullableString('  hello  ')).toBe('hello')
    expect(normalizeNullableString('   ')).toBeNull()
    expect(normalizeNullableString(null)).toBeNull()
    expect(normalizeNullableString(undefined)).toBeNull()
  })

  it('counts only non-deleted admins in a company', async () => {
    dbState.admins.push({
      id: 4,
      company_id: 1,
      role: ADMIN_ROLE_USER,
      firstname: 'Deleted',
      lastname: 'User',
      username: 'deleted',
      email: 'deleted@quizzup.test',
      mdp_hash: 'hash',
      status: ADMIN_STATUS_DELETED,
      created_at: MOCK_NOW,
      updated_at: MOCK_NOW,
      deleted_at: MOCK_NOW,
    })

    await expect(getCompanyAdminsCount(1)).resolves.toBe(2)
  })

  it('maps an admin row to the public API shape', async () => {
    const admin = await getAdminRow(1, 2)

    expect(admin).toMatchObject({
      id: 2,
      companyId: 1,
      role: ADMIN_ROLE_ADMIN,
      username: 'alice',
      email: 'alice@quizzup.test',
      status: ADMIN_STATUS_ACTIVE,
    })
    expect(admin as unknown as Record<string, unknown>).not.toHaveProperty('mdp_hash')
  })
})
