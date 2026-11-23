/**
 * Identité du site vitrine : nom, domaine, logo, contacts et informations légales, lus à la
 * construction (`build/plugins.ts`) et injectés dans les pages à la place des `%SITE_…%`
 * (`name` devient `%SITE_NAME%`, `company.legalName` devient `%SITE_COMPANY_LEGAL_NAME%`).
 * Aucune page n'écrit le nom du produit en dur : pour le changer, on ne modifie que ce fichier.
 *
 * Les valeurs « À COMPLÉTER » sont des informations de société que le dépôt ne connaît pas : à
 * remplir avant la mise en ligne (voir README).
 */
export const TODO = 'À COMPLÉTER'

/** Domaine provisoire (réservé à la documentation) : à remplacer par le vrai. */
const domain = 'example.org'

export const site = {
  name: 'QuizzUp',
  lang: 'fr',
  domain,
  /** Adresse publique de la vitrine, sans barre finale. */
  url: `https://www.${domain}`,
  /** Application (backoffice) : cible du bouton « Connexion ». */
  appUrl: `https://app.${domain}`,
  /**
   * API du backoffice : le formulaire poste vers `<apiUrl>/public/v1/demo-requests`. Vide : le
   * formulaire ouvre la messagerie (`mailto:`) au lieu d'envoyer.
   */
  apiUrl: `https://api.${domain}`,
  contactEmail: `a-completer@${domain}`,
  /** Logo affiché dans l'en-tête (fichier de `public/`) et ses dimensions réelles. */
  logo: { src: '/logo.webp', width: 90, height: 96 },
  /** Date de dernière mise à jour des pages légales, telle qu'elle s'affiche. */
  legalUpdatedAt: '23 novembre 2026',
  /** Éditeur du site (mentions légales) et responsable du traitement (confidentialité). */
  company: {
    legalName: TODO,
    legalForm: TODO,
    shareCapital: TODO,
    address: TODO,
    registration: TODO,
    vatNumber: TODO,
    phone: TODO,
    publicationDirector: TODO,
  },
  host: {
    name: TODO,
    address: TODO,
    phone: TODO,
  },
  privacy: {
    /** Durée de conservation d'une demande de démonstration. */
    retention: TODO,
  },
}

export type SiteConfig = typeof site
