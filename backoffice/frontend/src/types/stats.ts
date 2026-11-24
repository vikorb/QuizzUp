/** Codes d'erreur de `GET /companies/:companyId/stats`, plus ceux du client (réseau, JSON). */
export type StatsApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'api_unreachable'
  | 'invalid_json'
  | 'invalid_params'
  | 'stats_period_invalid'
  | 'stats_timezone_invalid'
  | 'server_error'

export type StatsRoomRow = {
  roomId: number
  roomName: string
  finished: number
  aborted: number
}

export type StatsSlot = {
  /** 1 = lundi à 7 = dimanche. */
  weekday: number
  /** Heure locale, 0 à 23. */
  hour: number
  sessions: number
}

/** Réponse de l'API : des agrégats, aucune donnée de joueur. Les taux vont de 0 à 1. */
export type CompanyStats = {
  period: { from: string; to: string; timeZone: string }
  sessions: {
    finished: number
    aborted: number
    abandonRate: number | null
    medianDurationSeconds: number | null
    byRoom: StatsRoomRow[]
  }
  players: {
    total: number
    averagePerSession: number | null
    withEmail: number
    emailRate: number | null
    withMarketingConsent: number
    marketingConsentRate: number | null
    distinctEmails: number
    returningEmails: number
  }
  busiestSlots: StatsSlot[]
}

export type StatsQuery = {
  from?: string
  to?: string
  roomId?: number
  tz?: string
}

export type StatsResult =
  | { ok: true; status: number; data: CompanyStats }
  | { ok: false; status: number | null; error: StatsApiErrorCode }
