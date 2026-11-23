import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Plugin } from 'vite'

import { site, type SiteConfig, TODO } from '../site.config'
import { type Page, PAGES } from './pages'

const ROOT = path.resolve(import.meta.dirname, '..')
const PARTIALS_DIR = path.join(ROOT, 'partials')

/** Variables de la charte : celles du backoffice, recopiées à la construction (jamais à la main). */
export const TOKENS_SOURCE = path.resolve(ROOT, '../backoffice/frontend/src/assets/styles/main.css')

/** Marqueur de `src/styles/site.css` remplacé par le bloc `:root` du backoffice. */
export const TOKENS_MARKER = '/* @tokens */'

// Seuls les `%SITE_…%` sont des variables : un `%C3%A9` d'adresse mailto n'en est pas une.
const PLACEHOLDER = /%(SITE_[A-Z0-9_]+)%/g
// `<!-- @include header current=/demonstration.html -->` marque ce lien `aria-current="page"`.
const INCLUDE = /<!--\s*@include\s+([a-z-]+)(?:\s+current=(\/\S*))?\s*-->/g

/** Domaine réservé à la documentation : tant qu'il est dans la configuration, on ne publie pas. */
export const EXAMPLE_DOMAIN = 'example.org'

/** Dérogation explicite pour construire un brouillon (CI, tests, essai local). */
export const DRAFT_ENV = 'VITRINE_DRAFT'

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Aplatit la configuration : `company.legalName` devient `SITE_COMPANY_LEGAL_NAME`. */
export function flattenConfig(value: object, prefix = 'SITE'): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    const name = `${prefix}_${key.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`
    if (typeof item === 'object' && item !== null) {
      Object.assign(out, flattenConfig(item, name))
    } else {
      out[name] = String(item)
    }
  }
  return out
}

/** Bloc `:root { … }` d'une feuille de style (sans l'`@import` de polices du backoffice). */
export function extractRootBlock(css: string): string {
  const block = /:root\s*\{[^}]*\}/.exec(css)
  if (!block) {
    throw new Error('Bloc :root introuvable dans la feuille de la charte')
  }
  return block[0]
}

/** Valeur d'une variable du bloc `:root` d'une feuille de style (`--bg-0` donne `#05060d`). */
export function tokenValue(css: string, name: string): string {
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(extractRootBlock(css))?.[1]
  if (!value) {
    throw new Error(`Variable ${name} introuvable dans la feuille de la charte`)
  }
  return value.trim()
}

/** Région d'`og:locale` déduite de la langue du site (`fr` donne `fr_FR`). */
export function ogLocale(lang: string): string {
  const locale = new Intl.Locale(lang).maximize()
  return `${locale.language}_${locale.region}`
}

/**
 * Remplace les `<!-- @include nom -->` par le fichier `partials/nom.html`, puis les `%SITE_…%`
 * par la configuration, plus deux valeurs dérivées : `%SITE_THEME_COLOR%` (le fond de la charte)
 * et `%SITE_OG_LOCALE%` (tiré de `lang`). Un nom inconnu fait échouer la construction : une faute
 * de frappe ne doit pas finir en ligne.
 */
export function renderPage(html: string, config: SiteConfig = site): string {
  const values: Record<string, string> = {
    ...flattenConfig(config),
    SITE_THEME_COLOR: tokenValue(readFileSync(TOKENS_SOURCE, 'utf8'), '--bg-0'),
    SITE_OG_LOCALE: ogLocale(config.lang),
  }
  const withPartials = html.replaceAll(INCLUDE, (_match, name: string, current?: string) => {
    const partial = readFileSync(path.join(PARTIALS_DIR, `${name}.html`), 'utf8')
    if (current === undefined) {
      return partial
    }
    const link = `href="${current}"`
    if (!partial.includes(link)) {
      throw new Error(`Le partial ${name} n'a pas de lien ${link} à marquer comme page courante`)
    }
    return partial.replace(link, `${link} aria-current="page"`)
  })
  return withPartials.replaceAll(PLACEHOLDER, (_match, name: string) => {
    const value = values[name]
    if (value === undefined) {
      throw new Error(`Variable inconnue dans une page : %${name}%`)
    }
    return escapeHtml(value)
  })
}

/**
 * Chemins (`company.legalName`) des valeurs de la configuration qu'on ne peut pas publier :
 * « À COMPLÉTER » ou domaine d'exemple.
 */
export function unpublishableValues(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, item]) => {
    const name = prefix ? `${prefix}.${key}` : key
    if (typeof item === 'object' && item !== null) {
      return unpublishableValues(item, name)
    }
    const text = String(item)
    return text === TODO || text.includes(EXAMPLE_DOMAIN) ? [name] : []
  })
}

/** Fait échouer la construction tant que la configuration n'est pas complète (sauf brouillon). */
export function assertPublishable(
  config: SiteConfig = site,
  env: Record<string, string | undefined> = process.env
): void {
  const missing = unpublishableValues(config)
  if (missing.length === 0 || env[DRAFT_ENV] === '1') {
    return
  }
  throw new Error(
    `Construction refusée : valeurs à compléter dans vitrine/site.config.ts (« ${TODO} » ou domaine ` +
      `${EXAMPLE_DOMAIN}) :\n${missing.map((name) => `  - ${name}`).join('\n')}\n` +
      `Pour construire un brouillon qui ne doit pas être publié : ${DRAFT_ENV}=1`
  )
}

export function buildRobots(url: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n`
}

export function buildSitemap(url: string, pages: readonly Page[] = PAGES): string {
  const entries = pages
    .filter((page) => page.indexed)
    .map((page) => `  <url><loc>${escapeHtml(url + page.path)}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`
}

export function vitrinePlugins(config: SiteConfig = site): Plugin[] {
  return [
    {
      name: 'vitrine:publishable',
      apply: 'build',
      buildStart() {
        assertPublishable(config)
      },
    },
    {
      name: 'vitrine:tokens',
      enforce: 'pre',
      transform(code, id) {
        if (!id.split('?')[0]?.endsWith('/site.css') || !code.includes(TOKENS_MARKER)) {
          return null
        }
        return code.replace(TOKENS_MARKER, extractRootBlock(readFileSync(TOKENS_SOURCE, 'utf8')))
      },
    },
    {
      name: 'vitrine:pages',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => renderPage(html, config),
      },
    },
    {
      name: 'vitrine:seo-files',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: buildRobots(config.url) })
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: buildSitemap(config.url),
        })
      },
    },
  ]
}
