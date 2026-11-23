import { isDeepStrictEqual } from 'node:util'

/**
 * Garde de sécurité : le personnel du backoffice ne règle ni les lumières ni la fumée d'une salle.
 * La machine à fumée dépend de toute la section `lighting` : `smoke` (durée, pause, armement,
 * relais), mais aussi `fixtures` et `customProfiles` (les canaux fumée se déduisent des profils
 * des appareils) et `bindings` (liaison d'une scène à fumée à un événement). Seul l'écran de
 * salle (compte de salle, sur place) écrit cette section ; le personnel peut seulement couper la
 * fumée (`lighting.smoke.enabled` de vrai à faux, le reste de `lighting` identique).
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `lighting` d'une configuration de salle ; absent ou section vide valent `{}`. */
function getLighting(config: unknown): unknown {
  const lighting = isRecord(config) ? config.lighting : undefined

  return lighting === undefined ? {} : lighting
}

/**
 * Vrai si remplacer la configuration `stored` par `incoming` change `lighting` autrement que par
 * la coupure de la fumée. Pour une création, `stored` vaut `{}` : toute section `lighting` non
 * vide est refusée.
 */
export function isLightingConfigChangeForbidden(stored: unknown, incoming: unknown): boolean {
  const before = getLighting(stored)
  const after = getLighting(incoming)

  if (isDeepStrictEqual(before, after)) {
    return false
  }

  const isCut =
    isRecord(before) &&
    isRecord(after) &&
    isRecord(before.smoke) &&
    isRecord(after.smoke) &&
    before.smoke.enabled === true &&
    after.smoke.enabled === false &&
    isDeepStrictEqual(
      { ...before, smoke: { ...before.smoke, enabled: false } },
      { ...after, smoke: { ...after.smoke, enabled: false } }
    )

  return !isCut
}
