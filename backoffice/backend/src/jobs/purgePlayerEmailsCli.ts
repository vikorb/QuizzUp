// Purge manuelle des emails joueurs expirés : `npm run purge:emails` (depuis backoffice/backend).
import 'dotenv/config'
import db from '../db'
import { purgeExpiredPlayerEmails } from './purgePlayerEmails'

async function main(): Promise<void> {
  try {
    const purged = await purgeExpiredPlayerEmails(db)
    console.log(`Purge RGPD : ${purged} ligne(s) de joueurs modifiée(s).`)
  } finally {
    await db.destroy()
  }
}

main().catch((error) => {
  console.error('Purge RGPD en échec :', error)
  process.exitCode = 1
})
