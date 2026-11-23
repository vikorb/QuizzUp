import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { MINI_GAMES } from '@quizzup/shared'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { PAGES } from '../build/pages'
import { DRAFT_ENV } from '../build/plugins'
import { site } from '../site.config'
import { FIELD_NAMES, LIMITS } from '../src/form'

const ROOT = path.resolve(import.meta.dirname, '..')
let outDir = ''

const read = (file: string) => readFileSync(path.join(outDir, file), 'utf8')

function filesOf(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesOf(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  )
}

beforeAll(async () => {
  // La configuration livrée a encore des valeurs « À COMPLÉTER » : on construit un brouillon.
  // Le refus sans dérogation est prouvé dans draft.test.ts.
  vi.stubEnv(DRAFT_ENV, '1')
  outDir = mkdtempSync(path.join(tmpdir(), 'vitrine-build-'))
  await build({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true },
  })
})

afterAll(() => {
  vi.unstubAllEnvs()
  if (outDir) {
    rmSync(outDir, { recursive: true, force: true })
  }
})

describe('pages construites', () => {
  it.each(PAGES.map((page) => page.file))('%s existe', (file) => {
    expect(existsSync(path.join(outDir, file))).toBe(true)
  })

  it.each(PAGES.map((page) => page.file))(
    '%s ne contient aucune variable %%…%% restante',
    (file) => {
      expect(read(file)).not.toMatch(/%SITE_[A-Z0-9_]+%/)
      expect(read(file)).not.toContain('@include')
    }
  )

  it.each(PAGES.map((page) => page.file))(
    '%s porte le nom du site venant de la configuration',
    (file) => {
      expect(read(file)).toContain(site.name)
      expect(read(file)).toContain(`<html lang="${site.lang}">`)
    }
  )

  it.each(PAGES.map((page) => page.file))('%s a un titre, une description et un h1', (file) => {
    const html = read(file)
    expect(html).toMatch(/<title>[^<]+<\/title>/)
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]{20,}"/)
    expect(html.match(/<h1[ >]/g)).toHaveLength(1)
  })

  it('n’embarque ni script ni style en ligne (CSP stricte), ni ressource externe', () => {
    for (const { file } of PAGES) {
      const html = read(file)
      expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
      expect(html).not.toMatch(/<style[\s>]/)
      expect(html).not.toMatch(/\son[a-z]+=/)
      expect(html).not.toMatch(/(?:src|href)="https?:\/\/(?!app\.)/)
    }
  })

  it('seule la page 404 est en noindex', () => {
    for (const { file } of PAGES) {
      expect(read(file).includes('content="noindex"')).toBe(file === '404.html')
    }
  })

  it('la couleur du thème et la locale viennent de la configuration et de la charte', () => {
    for (const { file } of PAGES) {
      expect(read(file)).toMatch(/name="theme-color" content="#[0-9a-f]{6}"/)
      expect(read(file)).toContain('property="og:locale" content="fr_FR"')
    }
  })

  it('marque la page courante dans la navigation', () => {
    expect(read('demonstration.html')).toContain('href="/demonstration.html" aria-current="page"')
    expect(read('index.html')).toContain('href="/" aria-current="page"')
    for (const file of ['mentions-legales.html', 'confidentialite.html', '404.html']) {
      expect(read(file)).not.toContain('aria-current')
    }
  })

  it('le champ piège porte un nom que les navigateurs ne remplissent pas', () => {
    const html = read('demonstration.html')
    expect(html).toContain('name="trap"')
    expect(html).not.toMatch(/name="website"/)
  })

  it('la zone d’état du formulaire n’est jamais masquée, pour être annoncée dès le premier message', () => {
    const css = filesOf(path.join(outDir, 'assets'))
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    expect(/\.form-status\{[^}]*display:\s*none/.test(css)).toBe(false)
  })

  it('le bouton de connexion pointe vers l’application configurée', () => {
    expect(read('index.html')).toContain(`href="${site.appUrl}"`)
  })

  it('une seule action principale par page', () => {
    for (const { file } of PAGES) {
      expect(read(file).match(/btn--primary/g)?.length ?? 0).toBeLessThanOrEqual(1)
    }
  })

  it('le formulaire pointe vers l’API configurée', () => {
    expect(read('demonstration.html')).toContain(`data-api-url="${site.apiUrl}"`)
  })

  it('les champs de la page suivent les bornes de la route', () => {
    const html = read('demonstration.html')
    const attrs = (id: string) =>
      html.match(new RegExp(`<(?:input|textarea)\\s[^>]*id="${id}"[^>]*>`))?.[0] ?? ''
    expect(attrs('f-name')).toContain(`maxlength="${LIMITS.name}"`)
    expect(attrs('f-company')).toContain(`maxlength="${LIMITS.company}"`)
    expect(attrs('f-email')).toContain(`maxlength="${LIMITS.email}"`)
    expect(attrs('f-phone')).toContain(`maxlength="${LIMITS.phone}"`)
    expect(attrs('f-rooms')).toContain(`max="${LIMITS.rooms}"`)
    expect(attrs('f-message')).toContain(`maxlength="${LIMITS.message}"`)
    // Le message est facultatif pour la route : la page ne l'exige pas.
    expect(attrs('f-message')).not.toContain('required')
    expect(attrs('f-company')).toContain('required')
  })

  it('chaque champ est relié à son message d’erreur, qui existe dans la page', () => {
    const html = read('demonstration.html')
    for (const name of FIELD_NAMES) {
      const control = html.match(new RegExp(`<(?:input|textarea)\\s[^>]*id="f-${name}"[^>]*>`))?.[0]
      expect(control, name).toContain(`f-${name}-error`)
      expect(control, name).toMatch(/aria-describedby="[^"]*f-\w+-error[^"]*"/)
      expect(html, name).toContain(`id="f-${name}-error"`)
    }
  })

  it('les pages légales affichent les valeurs de la société de la configuration', () => {
    const html = read('mentions-legales.html')
    expect(html).toContain(site.company.legalName)
    expect(html).toContain(site.host.name)
    expect(read('confidentialite.html')).toContain(site.privacy.retention)
  })
})

describe('fichiers générés', () => {
  it('robots.txt et sitemap.xml viennent de la configuration', () => {
    expect(read('robots.txt')).toContain(`Sitemap: ${site.url}/sitemap.xml`)
    const sitemap = read('sitemap.xml')
    for (const page of PAGES.filter((item) => item.indexed)) {
      expect(sitemap).toContain(`<loc>${site.url}${page.path}</loc>`)
    }
    expect(sitemap).not.toContain('404')
  })

  it('la feuille de style reçoit les variables de la charte du backoffice', () => {
    const css = filesOf(path.join(outDir, 'assets'))
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    expect(css).not.toContain('@tokens')
    expect(css).toContain('--bg')
    expect(css).toContain('--primary')
    expect(css).not.toContain('data:')
  })
})

describe('liens internes', () => {
  const REF = /\s(?:href|src|srcset|content)="([^"]+)"/g

  function internalTargets(html: string): string[] {
    const targets: string[] = []
    for (const match of html.matchAll(REF)) {
      const value = match[1] as string
      // Un `srcset` liste « url largeur, url largeur ».
      for (const part of value.split(',')) {
        const url = part.trim().split(/\s+/)[0] as string
        if (url.startsWith('/') && !url.startsWith('//')) {
          targets.push(url)
        }
      }
    }
    return targets
  }

  const toFile = (url: string): string => {
    const clean = (url.split('#')[0] as string).split('?')[0] as string
    return clean === '' || clean === '/' ? 'index.html' : clean.slice(1)
  }

  it.each(PAGES.map((page) => page.file))('chaque lien et image de %s existe', (file) => {
    const missing = internalTargets(read(file))
      .map(toFile)
      .filter((target) => !existsSync(path.join(outDir, target)))
    expect(missing).toEqual([])
  })

  it('chaque ancre #… visée existe dans la page cible', () => {
    const problems: string[] = []
    for (const { file } of PAGES) {
      for (const url of internalTargets(read(file))) {
        const [pathPart, anchor] = url.split('#')
        if (!anchor) {
          continue
        }
        const target = toFile(pathPart ?? '')
        if (!read(target).includes(`id="${anchor}"`)) {
          problems.push(`${file} -> ${url}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('les captures référencées pèsent quelque chose', () => {
    const captures = internalTargets(read('index.html')).filter((url) =>
      url.startsWith('/captures/')
    )
    expect(captures.length).toBeGreaterThan(0)
    for (const url of captures) {
      expect(statSync(path.join(outDir, toFile(url))).size).toBeGreaterThan(1000)
    }
  })
})

describe('contenu de la page d’accueil', () => {
  it('présente exactement les mini-jeux du moteur', () => {
    const shown = [...read('index.html').matchAll(/data-mini-game="([^"]+)"/g)].map(
      (match) => match[1]
    )
    expect([...shown].sort()).toEqual([...MINI_GAMES].sort())
  })

  it('les images ont des dimensions, un texte alternatif et un chargement différé hors écran', () => {
    const images = [...read('index.html').matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) {
      expect(image).toMatch(/\swidth="\d+"/)
      expect(image).toMatch(/\sheight="\d+"/)
      // Le logo est décoratif (le nom du site est écrit à côté) : alt vide voulu.
      expect(image).toMatch(image.includes('brand__logo') ? /\salt=""/ : /\salt="[^"]{10,}"/)
    }
    expect(images.filter((image) => image.includes('loading="lazy"')).length).toBeGreaterThan(0)
  })

  it('ne promet pas plus que le code : arrêt d’urgence logiciel, compatibilité vérifiée en démonstration', () => {
    const text = read('index.html')
      .replaceAll(/<[^>]+>/g, ' ')
      .replaceAll(/\s+/g, ' ')
    expect(text).toContain('arrêt d’urgence logiciel')
    expect(text).toContain('ne remplace pas l’arrêt d’urgence physique de la machine')
    expect(text).toContain('conçu pour piloter')
    expect(text).toContain('vérifiée pendant la démonstration')
    expect(text).not.toMatch(/Compatible avec|sans tout recâbler/)
  })

  it('ne cite ni prix ni concurrent', () => {
    const text = read('index.html').replaceAll(/<[^>]+>/g, ' ')
    expect(text).not.toMatch(/€|euros?\b|\btarifs?\b|\bprix\b/i)
  })

  it('ne contient ni point d’exclamation ni formule creuse', () => {
    const text = read('index.html').replaceAll(/<[^>]+>/g, ' ')
    expect(text).not.toContain('!')
    expect(text).not.toMatch(/Boostez|Révolutionn|tout-en-un/i)
  })
})
