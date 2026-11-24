/**
 * Statistiques d'exploitation (lot 7d). Période par défaut (jours) quand `from` manque, et plafond
 * d'une période demandée : le backend la borne, l'écran l'annonce.
 */
export const STATS_DEFAULT_PERIOD_DAYS = 30 as const
export const STATS_MAX_PERIOD_DAYS = 366 as const
