// src/server.ts
import 'dotenv/config'
import { buildApp } from './app'
import db from './db'
import { purgeExpiredPlayerEmails } from './jobs/purgePlayerEmails'
import {
  parsePlayerEmailPurgeIntervalHours,
  startPlayerEmailPurgeScheduler,
} from './jobs/playerEmailPurgeScheduler'

const app = buildApp()
const port = Number(process.env.API_PORT || 3001)

// Purge RGPD des emails joueurs (3 ans après la dernière partie), arrêtée à la fermeture de l'app.
const stopPlayerEmailPurge = startPlayerEmailPurgeScheduler({
  purge: () => purgeExpiredPlayerEmails(db),
  log: app.log,
  intervalHours: parsePlayerEmailPurgeIntervalHours(process.env.PLAYER_EMAIL_PURGE_INTERVAL_HOURS),
})
app.addHook('onClose', async () => stopPlayerEmailPurge())

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
