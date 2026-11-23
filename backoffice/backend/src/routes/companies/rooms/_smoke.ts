import { isDeepStrictEqual } from 'node:util'

/**
 * Garde de sécurité : le personnel du backoffice ne doit pouvoir ni activer ni régler à distance
 * la machine à fumée d'une salle. Seul l'écran de salle (compte de salle, sur place, après son
 * test de coupure) écrit `lighting.smoke` ; le personnel ne peut que la couper.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `lighting.smoke` d'une configuration de salle (`undefined` si elle est absente ou mal formée). */
function getSmokeConfig(config: unknown): unknown {
  const lighting = isRecord(config) ? config.lighting : undefined

  return isRecord(lighting) ? lighting.smoke : undefined
}

/** Même lecture stricte que l'écran de salle : seule la valeur `true` active la fumée. */
export function isSmokeEnabled(config: unknown): boolean {
  const smoke = getSmokeConfig(config)

  return isRecord(smoke) && smoke.enabled === true
}

/**
 * Vrai si remplacer la configuration `stored` par `incoming` change la partie fumée autrement
 * qu'en passant `enabled` de vrai à faux (les autres réglages restant identiques).
 */
export function isSmokeConfigChangeForbidden(stored: unknown, incoming: unknown): boolean {
  const before = getSmokeConfig(stored)
  const after = getSmokeConfig(incoming)

  if (isDeepStrictEqual(before, after)) {
    return false
  }

  const isCut =
    isRecord(before) &&
    before.enabled === true &&
    isRecord(after) &&
    after.enabled === false &&
    isDeepStrictEqual({ ...before, enabled: false }, after)

  return !isCut
}
