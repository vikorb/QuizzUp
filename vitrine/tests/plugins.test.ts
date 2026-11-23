import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { PAGES } from '../build/pages'
import {
  assertPublishable,
  buildRobots,
  buildSitemap,
  DRAFT_ENV,
  escapeHtml,
  extractRootBlock,
  flattenConfig,
  ogLocale,
  renderPage,
  TOKENS_SOURCE,
  tokenValue,
  unpublishableValues,
} from '../build/plugins'
import { site, type SiteConfig, TODO } from '../site.config'

const ROOT = path.resolve(import.meta.dirname, '..')
const renamed: SiteConfig = { ...site, name: 'SalleQuiz', url: 'https://www.salle-quiz.test' }

// Une configuration complète : rien à compléter, aucun domaine d'exemple.
const complete: SiteConfig = {
  ...site,
  domain: 'salle-quiz.test',
  url: 'https://www.salle-quiz.test',
  appUrl: 'https://app.salle-quiz.test',
  apiUrl: 'https://api.salle-quiz.test',
  contactEmail: 'contact@salle-quiz.test',
  company: {
    legalName: 'x',
    legalForm: 'x',
    shareCapital: 'x',
    address: 'x',
    registration: 'x',
    vatNumber: 'x',
    phone: 'x',
    publicationDirector: 'x',
  },
  host: { name: 'x', address: 'x', phone: 'x' },
  privacy: { retention: 'x' },
}

describe('flattenConfig', () => {
  it('aplatit les clés imbriquées en SITE_… majuscules', () => {
    const flat = flattenConfig({ name: 'A', company: { legalName: 'B', vatNumber: 'C' } })
    expect(flat).toEqual({
      SITE_NAME: 'A',
      SITE_COMPANY_LEGAL_NAME: 'B',
      SITE_COMPANY_VAT_NUMBER: 'C',
    })
  })

  it('expose les valeurs du site utilisées par les pages', () => {
    const flat = flattenConfig(site)
    expect(flat.SITE_NAME).toBe(site.name)
    expect(flat.SITE_APP_URL).toBe(site.appUrl)
    expect(flat.SITE_API_URL).toBe(site.apiUrl)
    expect(flat.SITE_CONTACT_EMAIL).toBe(site.contactEmail)
    expect(flat.SITE_LOGO_WIDTH).toBe(String(site.logo.width))
  })
})

describe('escapeHtml', () => {
  it('neutralise les caractères du HTML', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  })
})

describe('renderPage', () => {
  it('remplace les variables par la configuration', () => {
    expect(renderPage('<p>%SITE_NAME% %SITE_LANG%</p>', renamed)).toBe('<p>SalleQuiz fr</p>')
  })

  it('échappe les valeurs injectées', () => {
    expect(renderPage('<p>%SITE_NAME%</p>', { ...site, name: 'A<b>"' })).toBe(
      '<p>A&lt;b&gt;&quot;</p>'
    )
  })

  it('insère les partials avant de remplacer les variables', () => {
    const html = renderPage('<body><!-- @include header --></body>', renamed)
    expect(html).toContain('SalleQuiz')
    expect(html).not.toContain('@include')
    expect(html).not.toMatch(/%SITE_/)
  })

  // Le nom du produit ne s'écrit qu'une fois, dans site.config.ts : après un changement de nom,
  // plus aucune page ni aucun partial ne doit afficher l'ancien.
  const sources = [
    ...PAGES.map((page) => path.join(ROOT, page.file)),
    ...readdirSync(path.join(ROOT, 'partials')).map((file) => path.join(ROOT, 'partials', file)),
  ]

  it.each(sources.map((file) => path.relative(ROOT, file)))(
    '%s ne contient plus l’ancien nom après un changement de nom',
    (relative) => {
      const html = renderPage(readFileSync(path.join(ROOT, relative), 'utf8'), renamed)
      expect(html).not.toMatch(new RegExp(site.name, 'i'))
    }
  )

  it('une page entière rendue avec un autre nom porte le nouveau, y compris l’accueil', () => {
    const html = renderPage(readFileSync(path.join(ROOT, 'index.html'), 'utf8'), renamed)
    expect(html).toContain('SalleQuiz est conçu pour piloter')
  })

  it('dérive la couleur du thème de la charte et la locale de la langue', () => {
    const html = renderPage('<!-- @include head -->', renamed)
    expect(html).toContain(
      `name="theme-color" content="${tokenValue(readFileSync(TOKENS_SOURCE, 'utf8'), '--bg-0')}"`
    )
    expect(html).toContain('property="og:locale" content="fr_FR"')
    expect(renderPage('<!-- @include head -->', { ...renamed, lang: 'en' })).toContain(
      'content="en_US"'
    )
  })

  it('marque le lien de la page courante avec aria-current', () => {
    const html = renderPage('<!-- @include header current=/demonstration.html -->')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toContain('href="/demonstration.html" aria-current="page"')
    expect(renderPage('<!-- @include header -->')).not.toContain('aria-current')
  })

  it('échoue si le lien de la page courante n’existe pas dans le partial', () => {
    expect(() => renderPage('<!-- @include header current=/absente.html -->')).toThrow(
      '/absente.html'
    )
  })

  it('échoue sur une variable inconnue', () => {
    expect(() => renderPage('<p>%SITE_INCONNUE%</p>')).toThrow('%SITE_INCONNUE%')
  })

  it("ne confond pas un échappement d'adresse avec une variable", () => {
    expect(renderPage('mailto:a?subject=D%C3%A9mo')).toBe('mailto:a?subject=D%C3%A9mo')
  })

  it('échoue sur un partial qui n’existe pas', () => {
    expect(() => renderPage('<!-- @include absent -->')).toThrow()
  })
})

describe('extractRootBlock', () => {
  it('garde seulement le bloc :root', () => {
    const css = '@import url(x);\n:root {\n  --a: 1;\n  --b: 2;\n}\nbody { color: red; }'
    expect(extractRootBlock(css)).toBe(':root {\n  --a: 1;\n  --b: 2;\n}')
  })

  it('échoue sans bloc :root', () => {
    expect(() => extractRootBlock('body {}')).toThrow('Bloc :root')
  })
})

describe('tokenValue et ogLocale', () => {
  it('lit une variable du bloc :root', () => {
    expect(tokenValue(':root {\n  --bg-0: #05060d;\n  --a: 1;\n}', '--bg-0')).toBe('#05060d')
  })

  it('échoue sur une variable absente', () => {
    expect(() => tokenValue(':root {\n  --a: 1;\n}', '--bg-0')).toThrow('--bg-0')
  })

  it('déduit la région de la langue', () => {
    expect(ogLocale('fr')).toBe('fr_FR')
    expect(ogLocale('en')).toBe('en_US')
  })
})

describe('publication', () => {
  it('liste les valeurs « À COMPLÉTER » et le domaine d’exemple de la configuration', () => {
    const missing = unpublishableValues(site)
    expect(missing).toContain('company.legalName')
    expect(missing).toContain('host.name')
    expect(missing).toContain('privacy.retention')
    expect(missing).toContain('domain')
    expect(missing).toContain('contactEmail')
    expect(missing).not.toContain('name')
  })

  it('ne trouve rien à compléter dans une configuration complète', () => {
    expect(unpublishableValues(complete)).toEqual([])
    expect(() => assertPublishable(complete, {})).not.toThrow()
  })

  it('refuse la configuration par défaut et nomme les valeurs manquantes', () => {
    expect(() => assertPublishable(site, {})).toThrow(/company\.legalName[\s\S]*privacy\.retention/)
  })

  it('refuse une seule valeur à compléter', () => {
    const config = { ...complete, host: { ...complete.host, phone: TODO } }
    expect(() => assertPublishable(config, {})).toThrow('host.phone')
  })

  it('refuse le domaine d’exemple même quand tout le reste est rempli', () => {
    const config = { ...complete, apiUrl: 'https://api.example.org' }
    expect(() => assertPublishable(config, {})).toThrow('apiUrl')
  })

  it('accepte un brouillon avec la dérogation explicite', () => {
    expect(() => assertPublishable(site, { [DRAFT_ENV]: '1' })).not.toThrow()
  })

  it('ne se contente pas d’une dérogation vague', () => {
    expect(() => assertPublishable(site, { [DRAFT_ENV]: 'true' })).toThrow()
    expect(() => assertPublishable(site, { [DRAFT_ENV]: '' })).toThrow()
  })
})

describe('robots.txt et sitemap.xml', () => {
  it('pointent vers le domaine configuré', () => {
    expect(buildRobots(renamed.url)).toContain(`Sitemap: ${renamed.url}/sitemap.xml`)
    const sitemap = buildSitemap(renamed.url)
    expect(sitemap).toContain(`<loc>${renamed.url}/</loc>`)
    expect(sitemap).toContain(`<loc>${renamed.url}/demonstration.html</loc>`)
  })

  it('omet la page 404', () => {
    expect(buildSitemap(renamed.url)).not.toContain('404')
  })
})
