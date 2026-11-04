import { COMPANY_STATUS_ACTIVE } from '@quizzup/shared'

import db from '../db'

/**
 * Un PC de salle n'expire pas par inactivité (US-ROOM-02) : il ne doit donc rester connecté,
 * ou pouvoir se connecter, que tant que sa compagnie est active.
 */
export async function isRoomCompanyActive(companyId: number | string | null): Promise<boolean> {
  if (companyId === null) {
    return false
  }

  const company = await db('companies').where('id', companyId).first('status')

  return Number(company?.status) === COMPANY_STATUS_ACTIVE
}
