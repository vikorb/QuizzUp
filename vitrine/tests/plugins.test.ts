import { describe, expect, it } from 'vitest'

import {
  buildRobots,
  buildSitemap,
  escapeHtml,
  extractRootBlock,
  flattenConfig,
  renderPage,
} from '../build/plugins'
import { site, type SiteConfig } from '../site.config'

const renamed: SiteConfig = { ...site, name: 'SalleQuiz', url: 'https://www.salle-quiz.test' }

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
