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
