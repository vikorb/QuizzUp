import { GAME_STATE_FINISHED, GAME_STATUS_ACTIVE, VOUCHER_STATUS_ACTIVE } from '@quizzup/shared'

import { dbState } from './mockDb'
import { companyAdminUser, type TestUser } from './testApp'

/** Instant figé des tests de bons (horloge simulée) ; les bons valables finissent après, les périmés avant. */
export const VOUCHER_NOW = new Date('2027-03-10T08:00:00.000Z')

export const DAY_MS = 24 * 60 * 60 * 1000

export const CODE_A = '7K2M-9QXD'
export const CODE_B = 'ABCD-1234'

/** Personnel de la compagnie 1 : un opérateur (`user`) et un admin d'une autre compagnie. */
export const staffUser: TestUser = {
  sub: '3',
  id: 3,
  adminId: 3,
  company_id: 1,
  companyId: 1,
  role: 'user',
  sid: 'sid-staff',
}

export const otherCompanyAdmin: TestUser = {
  ...companyAdminUser,
  sub: '9',
  id: 9,
  adminId: 9,
  company_id: 2,
  companyId: 2,
}

/** Compagnie 1 avec les bons activés (libellé réglé, 30 jours de validité). */
export function enableVouchers(companyId = 1, label = 'Une partie offerte', days = 30): void {
  Object.assign(dbState.companies.find((company) => company.id === companyId) ?? {}, {
    voucher_label: label,
    voucher_validity_days: days,
  })
}

/** Partie de la compagnie avec deux pupitres (ids 10 et 11 pour la partie 5). */
export function seedGame(
  id = 5,
  { companyId = 1, state = GAME_STATE_FINISHED, status = GAME_STATUS_ACTIVE } = {}
): void {
  dbState.games.push({ id, company_id: companyId, room_id: 1, state, status })
  dbState.game_participants.push(
    { id: id * 2, game_id: id, podium: 1, display_name: 'Camille', second_display_name: 'Léa' },
    { id: id * 2 + 1, game_id: id, podium: 2, display_name: 'Noé', second_display_name: null }
  )
}

export function seedVoucher(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const row = {
    id: dbState.vouchers.length + 1,
    company_id: 1,
    game_id: 5,
    participant_id: 10,
    code: CODE_A,
    label: 'Une partie offerte',
    expires_at: new Date(VOUCHER_NOW.getTime() + 30 * DAY_MS),
    redeemed_at: null,
    redeemed_by: null,
    created_by: 2,
    status: VOUCHER_STATUS_ACTIVE,
    created_at: new Date(VOUCHER_NOW.getTime() - DAY_MS),
    updated_at: null,
    deleted_at: null,
    ...overrides,
  }

  dbState.vouchers.push(row)

  return row
}
