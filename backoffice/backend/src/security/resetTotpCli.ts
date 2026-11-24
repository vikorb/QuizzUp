// Réinitialise le deuxième facteur d'un superadmin (téléphone et codes de secours perdus, ou clé de
// chiffrement perdue) : `npm run totp:reset -- --username <identifiant>` (depuis backoffice/backend).
// Efface le secret et les codes de secours, révoque les sessions : le prochain login repasse par
// l'enrôlement. Demande un accès au serveur, voulu : aucune réinitialisation par l'API.
import 'dotenv/config'
import { parseArgs } from 'node:util'

import { ADMIN_ROLE_SUPERADMIN } from '@quizzup/shared'

import db from '../db'
import { resetAdminTotp } from './adminTotp'

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { username: { type: 'string' } } })
  const username = values.username?.trim()

  if (!username) {
    throw new Error('Usage : npm run totp:reset -- --username <identifiant>')
  }

  try {
    const admin = await db('admins')
      .select('id')
      .whereRaw('lower(username) = lower(?)', [username])
      .where({ role: ADMIN_ROLE_SUPERADMIN })
      .first()

    if (!admin) throw new Error(`Aucun superadmin avec l'identifiant « ${username} ».`)

    await resetAdminTotp(admin.id)
    console.log(`Double authentification réinitialisée pour « ${username} » : sessions révoquées.`)
  } finally {
    await db.destroy()
  }
}

main().catch((error) => {
  console.error('Réinitialisation TOTP en échec :', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
