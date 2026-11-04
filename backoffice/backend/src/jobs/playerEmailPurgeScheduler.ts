/** Fréquence par défaut de la purge RGPD des emails joueurs, en heures. */
export const DEFAULT_PLAYER_EMAIL_PURGE_INTERVAL_HOURS = 24

/** Intervalle minimum accepté, en heures (en dessous, la valeur est ignorée au profit du défaut). */
export const MIN_PLAYER_EMAIL_PURGE_INTERVAL_HOURS = 1

/** Délai avant la première purge, pour ne pas ralentir le démarrage du serveur. */
export const PLAYER_EMAIL_PURGE_INITIAL_DELAY_MS = 30_000

const HOUR_MS = 60 * 60 * 1000

// Plafond d'un minuteur Node (~24,8 jours) : au-delà il se déclencherait immédiatement.
const MAX_TIMER_MS = 2_147_483_647

type PurgeLogger = {
  info: (obj: object, msg?: string) => void
  error: (obj: object, msg?: string) => void
}

/**
 * Lit `PLAYER_EMAIL_PURGE_INTERVAL_HOURS` : absent, invalide ou inférieur à 1 h → 24 h ; `0` → désactivée (renvoie 0).
 */
export function parsePlayerEmailPurgeIntervalHours(value: string | undefined): number {
  const trimmed = value?.trim()

  if (!trimmed) {
    return DEFAULT_PLAYER_EMAIL_PURGE_INTERVAL_HOURS
  }

  const hours = Number(trimmed)

  // 0 désactive ; une valeur invalide, négative ou inférieure à 1 h retombe sur le défaut
  // (une purge plus fréquente que l'heure n'a pas de sens et chargerait la base).
  if (hours === 0) {
    return 0
  }

  if (!Number.isFinite(hours) || hours < MIN_PLAYER_EMAIL_PURGE_INTERVAL_HOURS) {
    return DEFAULT_PLAYER_EMAIL_PURGE_INTERVAL_HOURS
  }

  return hours
}

type SchedulerOptions = {
  /** Purge à exécuter ; renvoie le nombre de lignes modifiées. */
  purge: () => Promise<number>
  log: PurgeLogger
  /** Intervalle en heures ; `0` = désactivé (aucun minuteur). */
  intervalHours: number
  initialDelayMs?: number
}

/**
 * Planifie la purge : une exécution peu après le démarrage, puis à chaque intervalle. Les minuteurs
 * sont `unref()` (ils ne retiennent pas le processus) ; une erreur est journalisée sans
 * interrompre le serveur ni les exécutions suivantes. Renvoie la fonction d'arrêt.
 */
export function startPlayerEmailPurgeScheduler(options: SchedulerOptions): () => void {
  const { purge, log, intervalHours } = options

  if (!(intervalHours > 0)) {
    log.info({}, 'Purge RGPD des emails joueurs désactivée')

    return () => undefined
  }

  const intervalMs = Math.min(Math.round(intervalHours * HOUR_MS), MAX_TIMER_MS)
  let running = false

  const run = async (): Promise<void> => {
    if (running) {
      return
    }

    running = true

    try {
      const purged = await purge()
      log.info({ purged }, 'Purge RGPD des emails joueurs terminée')
    } catch (error) {
      log.error({ err: error }, 'Purge RGPD des emails joueurs en échec')
    } finally {
      running = false
    }
  }

  const initialTimer = setTimeout(
    () => void run(),
    options.initialDelayMs ?? PLAYER_EMAIL_PURGE_INITIAL_DELAY_MS
  )
  const intervalTimer = setInterval(() => void run(), intervalMs)

  initialTimer.unref()
  intervalTimer.unref()

  return () => {
    clearTimeout(initialTimer)
    clearInterval(intervalTimer)
  }
}
