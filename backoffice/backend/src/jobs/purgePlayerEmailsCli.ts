// Purge manuelle des emails joueurs expirés : `npm run purge:emails` (depuis backoffice/backend).
import 'dotenv/config'

import db from '../db'
import { purgeStaleJoinRegistrations } from './purgeJoinRegistrations'
import { purgeExpiredPlayerEmails } from './purgePlayerEmails'

async function main(): Promise<void> {
  try {
    const purged = await purgeExpiredPlayerEmails(db)
    const registrations = await purgeStaleJoinRegistrations(db)
    console.log(`Purge RGPD : ${purged} ligne(s) de joueurs modifiée(s).`)
    console.log(`Purge RGPD : ${registrations} demande(s) d'inscription supprimée(s).`)
  } finally {
    await db.destroy()
  }
}

main().catch((error) => {
  console.error('Purge RGPD en échec :', error)
  process.exitCode = 1
})
