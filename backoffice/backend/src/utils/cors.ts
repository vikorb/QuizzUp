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
function parseOriginList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

/**
 * Origines autorisées sur l'API publique : `VITRINE_ORIGINS` plus l'origine de `PUBLIC_APP_URL`
 * (le site qui sert /rejoindre/ et /bon/ appelle l'API depuis le navigateur du joueur). Une
 * `PUBLIC_APP_URL` vide ou invalide n'ajoute rien ; pas de doublon.
 */
export function parsePublicOrigins(
  vitrineOrigins: string | undefined,
  publicAppUrl: string | undefined
): string[] {
  const origins = parseOriginList(vitrineOrigins)

  if (URL.canParse(publicAppUrl?.trim() ?? '')) {
    const { origin } = new URL(publicAppUrl!.trim())

    // `origin` vaut « null » pour un schéma sans origine (file:, data:) : on n'en veut pas.
    if (origin !== 'null' && !origins.includes(origin)) origins.push(origin)
  }

  return origins
}
