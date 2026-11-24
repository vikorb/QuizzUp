/**
 * i18n minimal des pages publiques pour téléphone (`/rejoindre/`, puis `/bon/`) : deux langues,
 * des textes à `{paramètres}`, aucune dépendance. Ces pages restent hors du bundle du backoffice,
 * elles n'embarquent donc pas `vue-i18n`.
 */
type PublicLocale = 'fr' | 'en'

/** Langue du navigateur : le français par défaut, l'anglais si la langue principale n'est pas le français. */
export function detectLocale(
  languages: readonly string[] = navigator.languages ?? []
): PublicLocale {
  const main = languages[0]?.toLowerCase()

  return main && !main.startsWith('fr') ? 'en' : 'fr'
}

/** `fr` est la référence : une clé absente de `en` ne compile pas. */
export type PublicMessages<Fr extends Record<string, string>> = {
  fr: Fr
  en: Record<keyof Fr, string>
}

export function createTranslator<Fr extends Record<string, string>>(
  messages: PublicMessages<Fr>,
  locale: PublicLocale
) {
  return (key: keyof Fr & string, params: Record<string, string | number> = {}): string =>
    messages[locale][key].replace(/\{(\w+)\}/g, (_match, name: string) =>
      String(params[name] ?? '')
    )
}
