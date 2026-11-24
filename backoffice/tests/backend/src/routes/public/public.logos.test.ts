import '../_helpers/registerRouteMocks'

import publicRoutes from '@backend/routes/public'
import { PUBLIC_API_PREFIX } from '@backend/routes/public/_shared'
import { setMediaStorage } from '@backend/storage/mediaStorage'
import { COMPANY_STATUS_DELETED, COMPANY_STATUS_INACTIVE } from '@quizzup/shared'
import fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createMemoryMediaStorage, type MemoryMediaStorage } from '../_helpers/memoryMediaStorage'
import { dbState } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'

const FILE = '11111111-1111-4111-8111-111111111111.png'
const KEY = `logos/${FILE}`
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02])

let storage: MemoryMediaStorage

resetRouteMocksBeforeEach()

beforeEach(() => {
  storage = createMemoryMediaStorage()
  setMediaStorage(storage)
})

afterEach(() => {
  setMediaStorage(null)
})

function companyRow(id: number): Record<string, unknown> {
  const row = dbState.companies.find((company) => company.id === id)

  if (!row) {
    throw new Error(`company ${id} missing`)
  }

  return row
}

function giveLogo(companyId: number, key = KEY, mime = 'image/png') {
  Object.assign(companyRow(companyId), { logo_key: key, logo_mime_type: mime })
  storage.files.set(key, PNG)
}

async function getLogo(file: string) {
  const app = fastify({ logger: false })

  // Plugin enregistré avec le préfixe posé par routes/index.ts ; le projet de tests ne charge pas
  // les augmentations de types du backend.
  await app.register(publicRoutes as never, { prefix: PUBLIC_API_PREFIX })
  await app.ready()

  const response = await app.inject({ method: 'GET', url: `${PUBLIC_API_PREFIX}/logos/${file}` })

  await app.close()

  return response
}

describe('routes/public/logos — GET /public/v1/logos/:file', () => {
  it('serves the logo without authentication, with cache and nosniff headers', async () => {
    giveLogo(1)

    const response = await getLogo(FILE)

    expect(response.statusCode).toBe(200)
    expect(response.rawPayload).toEqual(PNG)
    expect(response.headers['content-type']).toBe('image/png')
    expect(response.headers['content-length']).toBe(String(PNG.length))
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })

  it('takes the Content-Type from the database, not from the file name', async () => {
    const jpg = FILE.replace('.png', '.jpg')

    giveLogo(1, `logos/${jpg}`, 'image/jpeg')

    const response = await getLogo(jpg)

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/jpeg')
  })

  it('serves the logo of an inactive company (only deleted ones disappear)', async () => {
    companyRow(2).status = COMPANY_STATUS_INACTIVE
    giveLogo(2)

    expect((await getLogo(FILE)).statusCode).toBe(200)
  })

  it('answers the very same 404 for unknown, deleted, logo-less and malformed requests', async () => {
    // Aucune compagnie n'utilise ce fichier.
    const unknown = await getLogo(FILE)

    // Compagnie supprimée.
    giveLogo(2)
    companyRow(2).status = COMPANY_STATUS_DELETED
    const deleted = await getLogo(FILE)

    // Compagnie sans logo : le fichier est dans le stockage, mais aucune ligne ne le référence.
    companyRow(2).logo_key = null
    const withoutLogo = await getLogo(FILE)

    // Clé qui ne respecte pas le motif (échappement du dossier, extension interdite).
    const traversal = await getLogo('..%2Fquestions%2F1%2Fx.mp3')
    const svg = await getLogo(FILE.replace('.png', '.svg'))

    for (const response of [unknown, deleted, withoutLogo, traversal, svg]) {
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'logo_not_found' })
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.headers['content-type']).toContain('application/json')
    }

    expect(deleted.body).toBe(unknown.body)
    expect(withoutLogo.body).toBe(unknown.body)
  })

  it('answers the same 404 when the file is missing from the storage', async () => {
    giveLogo(1)
    storage.files.delete(KEY)

    const response = await getLogo(FILE)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'logo_not_found' })
  })

  it('never exposes the storage key', async () => {
    giveLogo(1)

    const ok = await getLogo(FILE)
    const missing = await getLogo('22222222-2222-4222-8222-222222222222.png')

    for (const response of [ok, missing]) {
      expect(JSON.stringify(response.headers)).not.toContain('logos/')
      expect(response.body).not.toContain('logo_key')
    }
  })
})
