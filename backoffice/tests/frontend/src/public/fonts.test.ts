import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Tests lancés depuis `backoffice/` (cf. les configurations vitest).
const SRC = path.resolve(process.cwd(), 'frontend/src')
const STYLES = path.join(SRC, 'assets/styles')
const read = (file: string) => readFileSync(file, 'utf8')

/** Les points d'entrée des pages publiques : `src/public/<page>/main.ts`. */
const publicEntries = readdirSync(path.join(SRC, 'public'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(SRC, 'public', entry.name, 'main.ts'))

describe('polices des pages publiques', () => {
  it('finds the public entries', () => {
    expect(publicEntries.length).toBeGreaterThan(0)
  })

  it('keeps main.css free of any remote import', () => {
    const css = read(path.join(STYLES, 'main.css'))

    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    expect(css).not.toMatch(/@import\s+(url\()?\s*['"]?https?:/i)
  })

  it('keeps the Google Fonts import in fonts.css, for the backoffice only', () => {
    expect(read(path.join(STYLES, 'fonts.css'))).toContain('fonts.googleapis.com')
    expect(read(path.join(SRC, 'main.ts'))).toContain('@/assets/styles/fonts.css')
  })

  it.each(publicEntries)('%s does not load fonts.css', (entry) => {
    expect(read(entry)).not.toMatch(/fonts\.css/)
  })
})
