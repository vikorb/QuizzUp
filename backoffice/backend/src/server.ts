// src/server.ts
import 'dotenv/config'
import { buildApp } from './app'
import db from './db'
import { purgeExpiredDemoRequests } from './jobs/purgeDemoRequests'
import { purgeExpiredPlayerEmails } from './jobs/purgePlayerEmails'
import { purgeStaleJoinRegistrations } from './jobs/purgeJoinRegistrations'
import {
  parsePlayerEmailPurgeIntervalHours,
  startPlayerEmailPurgeScheduler,
} from './jobs/playerEmailPurgeScheduler'

const app = buildApp()
const port = Number(process.env.API_PORT || 3001)

// Purges RGPD, arrêtées à la fermeture de l'app. Un seul intervalle règle les trois :
// emails joueurs (3 ans après la dernière partie), demandes de démonstration (12 mois) et demandes
// d'inscription des joueurs non validées (24 h).
const purgeIntervalHours = parsePlayerEmailPurgeIntervalHours(
  process.env.PLAYER_EMAIL_PURGE_INTERVAL_HOURS
)
const stopPlayerEmailPurge = startPlayerEmailPurgeScheduler({
  purge: () => purgeExpiredPlayerEmails(db),
  log: app.log,
  intervalHours: purgeIntervalHours,
})
const stopDemoRequestPurge = startPlayerEmailPurgeScheduler({
  purge: () => purgeExpiredDemoRequests(db),
  log: app.log,
  intervalHours: purgeIntervalHours,
  label: 'Purge RGPD des demandes de démonstration',
})
const stopJoinRegistrationPurge = startPlayerEmailPurgeScheduler({
  purge: () => purgeStaleJoinRegistrations(db),
  log: app.log,
  intervalHours: purgeIntervalHours,
  label: "Purge RGPD des demandes d'inscription",
})
app.addHook('onClose', async () => {
  stopPlayerEmailPurge()
  stopDemoRequestPurge()
  stopJoinRegistrationPurge()
})

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
