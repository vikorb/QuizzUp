// Importé par `index.ts` avec l'extension .js : Node résout ainsi le build ESM tel quel, alors que
// tsc et Vite rapportent ce nom au fichier .ts.

/**
 * API de réservation `/public/v1` (lot 14) : clés d'API des compagnies, journal des appels et
 * idempotence. Les valeurs de `status` reprennent la convention commune (1 actif, 2 supprimé) ;
 * une clé révoquée a `status = 2` et `deleted_at` renseigné.
 */

export const API_KEY_STATUS_ACTIVE = 1 as const
export const API_KEY_STATUS_REVOKED = 2 as const

/** Dans l'ordre du `CHECK` de `api_keys.status` (un test compare les deux). */
export const API_KEY_STATUSES = [API_KEY_STATUS_ACTIVE, API_KEY_STATUS_REVOKED] as const

export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number]

/** Début de tout secret d'API (`qzk_<préfixe>_<secret>`) : permet de le repérer dans du code. */
export const API_KEY_TOKEN_PREFIX = 'qzk_' as const

/** Nombre maximal de clés actives par compagnie. */
export const API_KEY_MAX_ACTIVE = 10 as const

/** Durée de conservation du journal des appels (`api_request_logs`), en jours. */
export const API_LOG_RETENTION_DAYS = 90 as const

/** Durée de conservation d'une clé d'idempotence (`api_idempotency_keys`), en heures. */
export const API_IDEMPOTENCY_TTL_HOURS = 24 as const
