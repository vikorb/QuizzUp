import { EXTRACT_EFFECTS, type ExtractEffect } from '@quizzup/audio'

/**
 * Lit l'effet d'un extrait reçu du serveur ou d'un payload d'événement. Champ absent, nul, d'un
 * autre type ou valeur inconnue (serveur plus récent) : `none`, jamais d'erreur, la partie continue.
 */
export function toExtractEffect(value: unknown): ExtractEffect {
  return EXTRACT_EFFECTS.find((effect) => effect === value) ?? 'none'
}
