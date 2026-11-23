import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { build } from 'vite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DRAFT_ENV } from '../build/plugins'

const ROOT = path.resolve(import.meta.dirname, '..')
let outDir = ''

beforeEach(() => {
  outDir = mkdtempSync(path.join(tmpdir(), 'vitrine-draft-'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(outDir, { recursive: true, force: true })
})

const run = () =>
  build({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true, write: false },
  })

describe('construction sans dérogation', () => {
  it('est refusée tant que site.config.ts a des valeurs à compléter, et les liste', async () => {
    vi.stubEnv(DRAFT_ENV, '')
    const error = await run().then(
      () => undefined,
      (caught: unknown) => caught as Error
    )
    expect(error?.message).toMatch(/domain[\s\S]*company\.legalName/)
    expect(error?.message).toContain(`${DRAFT_ENV}=1`)
  })

  // La réussite avec VITRINE_DRAFT=1 est couverte par build.test.ts, qui construit tout le site.
})
