import '../_helpers/registerRouteMocks'

import companyLogoRoutes from '@backend/routes/companies/logo'
import { canRoleAccessApi } from '@backend/security/permissions'
import { setMediaStorage } from '@backend/storage/mediaStorage'
import { COMPANY_LOGO_MAX_BYTES, COMPANY_STATUS_DELETED } from '@quizzup/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createMemoryMediaStorage, type MemoryMediaStorage } from '../_helpers/memoryMediaStorage'
import { dbState, lockedTables } from '../_helpers/mockDb'
import { securityState } from '../_helpers/mockSecurity'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
} from '../_helpers/testApp'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

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

async function putLogo(
  companyId: number,
  options: { body?: Buffer; contentType?: string; user?: typeof superadminUser | null } = {}
) {
  const app = await createRouteApp(companyLogoRoutes)
  const user = options.user === undefined ? companyAdminUser : options.user

  const response = await app.inject({
    method: 'PUT',
    url: `/companies/${companyId}/logo`,
    headers: {
      ...(user ? authHeaders(user) : {}),
      'content-type': options.contentType ?? 'image/png',
    },
    payload: options.body ?? PNG,
  })

  await app.close()

  return response
}

async function deleteLogo(
  companyId: number,
  user: typeof superadminUser | null = companyAdminUser
) {
  const app = await createRouteApp(companyLogoRoutes)
  const response = await app.inject({
    method: 'DELETE',
    url: `/companies/${companyId}/logo`,
    headers: user ? authHeaders(user) : {},
  })

  await app.close()

  return response
}

describe('routes/companies/logo — envoi', () => {
  it.each([
    ['png', PNG, 'image/png'],
    ['jpg', JPEG, 'image/jpeg'],
    ['webp', WEBP, 'image/webp'],
  ])(
    'stores a %s logo and returns its public url, never the storage key',
    async (ext, body, mime) => {
      const response = await putLogo(1, { body, contentType: mime })

      expect(response.statusCode).toBe(200)

      const row = companyRow(1)
      const key = String(row.logo_key)

      expect(key).toMatch(new RegExp(`^logos/[0-9a-f-]{36}\\.${ext}$`))
      expect(row.logo_mime_type).toBe(mime)
      expect(row.logo_updated_at).not.toBeNull()
      expect(storage.files.get(key)).toEqual(body)
      expect(parseJson(response)).toEqual({
        logoUrl: `/public/v1/logos/${key.slice('logos/'.length)}`,
      })
      expect(lockedTables).toContain('companies')
    }
  )

  it('refuses an svg, whatever the announced content type', async () => {
    for (const contentType of ['image/svg+xml', 'image/png', 'application/octet-stream']) {
      const response = await putLogo(1, { body: SVG, contentType })

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'logo_type_invalid' })
    }

    expect(storage.files.size).toBe(0)
    expect(companyRow(1).logo_key ?? null).toBeNull()
  })

  it('refuses a file announced as png whose bytes are something else', async () => {
    const response = await putLogo(1, { body: Buffer.from('MZ not an image at all') })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'logo_type_invalid' })
    expect(storage.files.size).toBe(0)
  })

  it('trusts the bytes, not the header: a png sent as image/svg+xml is stored as png', async () => {
    const response = await putLogo(1, { contentType: 'image/svg+xml' })

    expect(response.statusCode).toBe(200)
    expect(companyRow(1).logo_mime_type).toBe('image/png')
  })

  it('refuses an empty body', async () => {
    const response = await putLogo(1, { body: Buffer.alloc(0) })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'logo_type_invalid' })
  })

  it('answers 413 logo_too_large above the limit and stores nothing', async () => {
    const response = await putLogo(1, {
      body: Buffer.concat([PNG, Buffer.alloc(COMPANY_LOGO_MAX_BYTES)]),
    })

    expect(response.statusCode).toBe(413)
    expect(parseJson(response)).toEqual({ error: 'logo_too_large' })
    expect(storage.files.size).toBe(0)
  })

  it('accepts a file of exactly the maximum size', async () => {
    const body = Buffer.concat([PNG, Buffer.alloc(COMPANY_LOGO_MAX_BYTES - PNG.length)])
    const response = await putLogo(1, { body })

    expect(response.statusCode).toBe(200)
  })

  it('keeps the default handling of other body errors (broken JSON stays a 400)', async () => {
    const response = await putLogo(1, {
      body: Buffer.from('{broken'),
      contentType: 'application/json',
    })

    expect(response.statusCode).toBe(400)
  })

  it('removes the previous file when a logo is replaced', async () => {
    await putLogo(1, { body: PNG })
    const firstKey = String(companyRow(1).logo_key)

    const response = await putLogo(1, { body: JPEG, contentType: 'image/jpeg' })
    const secondKey = String(companyRow(1).logo_key)

    expect(response.statusCode).toBe(200)
    expect(secondKey).not.toBe(firstKey)
    expect(secondKey).toMatch(/\.jpg$/)
    expect(storage.removed).toEqual([firstKey])
    expect([...storage.files.keys()]).toEqual([secondKey])
  })

  it('does not touch the logo of another company', async () => {
    await putLogo(1, { user: superadminUser })
    const logoOfOne = companyRow(1).logo_key

    await putLogo(2, { user: superadminUser, body: JPEG, contentType: 'image/jpeg' })

    expect(companyRow(1).logo_key).toBe(logoOfOne)
    expect(String(companyRow(2).logo_key)).toMatch(/\.jpg$/)
    expect(storage.removed).toEqual([])
  })

  it('refuses an admin of company A on company B, without storing anything', async () => {
    const response = await putLogo(2, { user: companyAdminUser })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })
    expect(storage.files.size).toBe(0)
    expect(companyRow(2).logo_key ?? null).toBeNull()
  })

  it('lets the superadmin set the logo of any company', async () => {
    const response = await putLogo(2, { user: superadminUser })

    expect(response.statusCode).toBe(200)
    expect(String(companyRow(2).logo_key)).toMatch(/^logos\//)
  })

  it('refuses roles without the company:update permission', async () => {
    securityState.hasPermission = false

    const response = await putLogo(1)

    expect(response.statusCode).toBe(403)
    expect(storage.files.size).toBe(0)
  })

  it('refuses a request that is not authenticated', async () => {
    const response = await putLogo(1, { user: null })

    expect(response.statusCode).toBe(401)
    expect(storage.files.size).toBe(0)
  })

  it('rejects an invalid company id', async () => {
    const response = await putLogo(0)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'invalid_params' })
  })

  it('answers 404 for an unknown or deleted company, without storing anything', async () => {
    dbState.companies.push({ id: 3, name: 'Supprimée', status: COMPANY_STATUS_DELETED })

    for (const id of [999, 3]) {
      const response = await putLogo(id, { user: superadminUser })

      expect(response.statusCode).toBe(404)
      expect(parseJson(response)).toEqual({ error: 'not_found' })
    }

    expect(storage.files.size).toBe(0)
  })

  it('cleans the new file when the company is deleted during the write', async () => {
    const realSave = storage.save.bind(storage)

    storage.save = async (key, content) => {
      await realSave(key, content)
      companyRow(1).status = COMPANY_STATUS_DELETED
    }

    const response = await putLogo(1)

    expect(response.statusCode).toBe(404)
    expect(storage.files.size).toBe(0)
    expect(storage.removed).toHaveLength(1)
    expect(companyRow(1).logo_key ?? null).toBeNull()
  })
})

describe('routes/companies/logo — suppression', () => {
  it('clears the logo columns, removes the file and answers 204', async () => {
    await putLogo(1)
    const key = String(companyRow(1).logo_key)

    const response = await deleteLogo(1)

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    expect(companyRow(1)).toMatchObject({
      logo_key: null,
      logo_mime_type: null,
      logo_updated_at: null,
    })
    expect(storage.removed).toEqual([key])
    expect(storage.files.size).toBe(0)
  })

  it('answers 204 when the company has no logo, and removes nothing', async () => {
    const response = await deleteLogo(1)

    expect(response.statusCode).toBe(204)
    expect(storage.removed).toEqual([])
  })

  it('refuses an admin of company A on the logo of company B', async () => {
    await putLogo(2, { user: superadminUser })
    const key = companyRow(2).logo_key

    const response = await deleteLogo(2, companyAdminUser)

    expect(response.statusCode).toBe(403)
    expect(companyRow(2).logo_key).toBe(key)
    expect(storage.removed).toEqual([])
  })

  it('refuses roles without permission and a missing session, and answers 404 for a deleted company', async () => {
    securityState.hasPermission = false
    expect((await deleteLogo(1)).statusCode).toBe(403)

    securityState.hasPermission = true
    expect((await deleteLogo(1, null)).statusCode).toBe(401)

    dbState.companies.push({ id: 3, name: 'Supprimée', status: COMPANY_STATUS_DELETED })
    expect((await deleteLogo(3, superadminUser)).statusCode).toBe(404)
  })
})

describe('security/permissions — company:update (matrice réelle)', () => {
  it('lets superadmin and admin change a logo, not the user role', () => {
    expect(canRoleAccessApi('superadmin', 'company', 'update')).toBe(true)
    expect(canRoleAccessApi('admin', 'company', 'update')).toBe(true)
    expect(canRoleAccessApi('user', 'company', 'update')).toBe(false)
  })
})
