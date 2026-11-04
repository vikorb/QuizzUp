import { COMPANY_STATUS_ACTIVE, ROOM_STATUS_DELETED } from '@quizzup/shared'

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

/**
 * Compte de salle utilisable : compagnie active et salle non supprimée. Une salle supprimée
 * supprime déjà son compte ; ce contrôle couvre une création de compte concurrente.
 */
export async function isRoomAccountUsable(
  companyId: number | string | null,
  roomId: number | string | null
): Promise<boolean> {
  if (roomId === null || !(await isRoomCompanyActive(companyId))) {
    return false
  }

  const room = await db('rooms').where('id', roomId).first('status')

  return room !== undefined && Number(room.status) !== ROOM_STATUS_DELETED
}
