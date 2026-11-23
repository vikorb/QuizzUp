/** Pages du site : un fichier HTML à la racine du paquet chacune. */
export type Page = {
  /** Nom du fichier source et du fichier construit. */
  file: string
  /** Chemin public de la page. */
  path: string
  /** Présente dans le plan du site (la page 404 ne l'est pas). */
  indexed: boolean
}

export const PAGES: readonly Page[] = [
  { file: 'index.html', path: '/', indexed: true },
  { file: 'demonstration.html', path: '/demonstration.html', indexed: true },
  { file: 'mentions-legales.html', path: '/mentions-legales.html', indexed: true },
  { file: 'confidentialite.html', path: '/confidentialite.html', indexed: true },
  { file: '404.html', path: '/404.html', indexed: false },
]
