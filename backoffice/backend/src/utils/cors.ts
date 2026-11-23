/**
 * `CORS_ORIGIN` vide ou `*` : toutes les origines ; sinon une liste séparée par des
 * virgules (ex. backoffice :4173 et écran de salle :4174).
 */
export function parseCorsOrigin(value: string | undefined): true | string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return origins.length === 0 || origins.includes('*') ? true : origins
}

/**
 * Liste d'origines exactes séparées par des virgules (`VITRINE_ORIGINS`). Contrairement à
 * `parseCorsOrigin`, vide veut dire aucune origine : l'API publique est fermée aux navigateurs
 * tant qu'on n'a pas nommé le site qui a le droit de l'appeler.
 */
export function parseOriginList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}
