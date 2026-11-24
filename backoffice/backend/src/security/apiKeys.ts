import { createHash, randomBytes } from 'node:crypto'

import { API_KEY_TOKEN_PREFIX } from '@quizzup/shared'

/** Empreinte d'un jeton : SHA-256 en hexadécimal (64 caractères), clé de recherche de `api_keys`. */
export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type GeneratedApiKey = {
  /** Le jeton entier : montré une seule fois, jamais stocké. */
  token: string
  /** `qzk_` + 8 caractères : stocké dans `key_prefix`, affiché pour reconnaître la clé. */
  prefix: string
  /** À stocker dans `key_hash`. */
  hash: string
}

/**
 * Format `qzk_<8 caractères>_<32 octets en base64url>`. Pas de hachage lent : 256 bits d'entropie
 * rendent l'attaque par dictionnaire sans objet, et la clé est relue à chaque appel.
 */
export function generateApiKey(): GeneratedApiKey {
  const prefix = `${API_KEY_TOKEN_PREFIX}${randomBytes(4).toString('hex')}`
  const token = `${prefix}_${randomBytes(32).toString('base64url')}`

  return { token, prefix, hash: hashApiKey(token) }
}
