import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Plugin } from 'vite'

import { site, type SiteConfig } from '../site.config'
import { type Page, PAGES } from './pages'

const ROOT = path.resolve(import.meta.dirname, '..')
const PARTIALS_DIR = path.join(ROOT, 'partials')

/** Variables de la charte : celles du backoffice, recopiées à la construction (jamais à la main). */
export const TOKENS_SOURCE = path.resolve(ROOT, '../backoffice/frontend/src/assets/styles/main.css')

/** Marqueur de `src/styles/site.css` remplacé par le bloc `:root` du backoffice. */
export const TOKENS_MARKER = '/* @tokens */'

// Seuls les `%SITE_…%` sont des variables : un `%C3%A9` d'adresse mailto n'en est pas une.
const PLACEHOLDER = /%(SITE_[A-Z0-9_]+)%/g
const INCLUDE = /<!--\s*@include\s+([a-z-]+)\s*-->/g

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

/**
 * Remplace les `<!-- @include nom -->` par le fichier `partials/nom.html`, puis les `%SITE_…%`
 * par la configuration. Un nom inconnu fait échouer la construction : une faute de frappe ne
 * doit pas finir en ligne.
 */
export function renderPage(html: string, config: SiteConfig = site): string {
  const values = flattenConfig(config)
  const withPartials = html.replaceAll(INCLUDE, (_match, name: string) =>
    readFileSync(path.join(PARTIALS_DIR, `${name}.html`), 'utf8')
  )
  return withPartials.replaceAll(PLACEHOLDER, (_match, name: string) => {
    const value = values[name]
    if (value === undefined) {
      throw new Error(`Variable inconnue dans une page : %${name}%`)
    }
    return escapeHtml(value)
  })
}

/** Bloc `:root { … }` d'une feuille de style (sans l'`@import` de polices du backoffice). */
export function extractRootBlock(css: string): string {
  const block = /:root\s*\{[^}]*\}/.exec(css)
  if (!block) {
    throw new Error('Bloc :root introuvable dans la feuille de la charte')
  }
  return block[0]
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
