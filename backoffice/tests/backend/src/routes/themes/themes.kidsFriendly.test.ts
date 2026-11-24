import '../_helpers/registerRouteMocks'

import { beforeEach, describe, expect, it } from 'vitest'

import themesRoutes from '@backend/routes/themes'
import { dbState } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../_helpers/testApp'
import { seedThemesData } from './_fixtures'

resetRouteMocksBeforeEach()

beforeEach(() => {
  seedThemesData()
})

type ThemePayload = { theme: { id: number; kidsFriendly: boolean } }

function stored(id: number): Record<string, unknown> {
  const row = dbState.themes.find((theme) => theme.id === id)

  if (!row) {
    throw new Error(`theme ${id} missing`)
  }

  return row
}

async function send(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: Record<string, unknown>,
  user: TestUser = companyAdminUser
) {
  const app = await createRouteApp(themesRoutes)
  const response = await app.inject({ method, url, headers: authHeaders(user), payload })

  await app.close()

  return response
}

const create = (payload: Record<string, unknown>, user?: TestUser) =>
  send('POST', '/themes', { name: 'Contes', mode: 'classic', ...payload }, user)

describe('POST /themes — kidsFriendly', () => {
  it('stores the flag and returns it', async () => {
    const response = await create({ kidsFriendly: true })

    expect(response.statusCode).toBe(201)

    const { theme } = parseJson<ThemePayload>(response)

    expect(theme.kidsFriendly).toBe(true)
    expect(stored(theme.id).kids_friendly).toBe(true)
  })

  it('creates a theme that is not for kids when the field is absent', async () => {
    const response = await create({})

    expect(response.statusCode).toBe(201)

    const { theme } = parseJson<ThemePayload>(response)

    expect(theme.kidsFriendly).toBe(false)
    expect(stored(theme.id).kids_friendly).toBe(false)
  })

  it('refuses a value that is not a boolean, and writes nothing', async () => {
    const before = dbState.themes.length

    for (const kidsFriendly of ['true', 1, null]) {
      const response = await create({ kidsFriendly })

      expect(response.statusCode).toBe(400)
      expect(parseJson<{ error: string }>(response).error).toBe('theme_kids_friendly_invalid')
    }

    expect(dbState.themes).toHaveLength(before)
  })
})

describe('PATCH /themes/:themeId — kidsFriendly', () => {
  it('turns the flag on, then off', async () => {
    const on = await send('PATCH', '/themes/3', { kidsFriendly: true })

    expect(on.statusCode).toBe(200)
    expect(parseJson<ThemePayload>(on).theme.kidsFriendly).toBe(true)
    expect(stored(3).kids_friendly).toBe(true)

    const off = await send('PATCH', '/themes/3', { kidsFriendly: false })

    expect(parseJson<ThemePayload>(off).theme.kidsFriendly).toBe(false)
    expect(stored(3).kids_friendly).toBe(false)
  })

  it('keeps the flag when the field is absent', async () => {
    stored(3).kids_friendly = true

    const response = await send('PATCH', '/themes/3', { name: 'Renommé' })

    expect(response.statusCode).toBe(200)
    expect(parseJson<ThemePayload>(response).theme.kidsFriendly).toBe(true)
    expect(stored(3)).toMatchObject({ name: 'Renommé', kids_friendly: true })
  })

  it('refuses a value that is not a boolean', async () => {
    const response = await send('PATCH', '/themes/3', { kidsFriendly: 'oui' })

    expect(response.statusCode).toBe(400)
    expect(parseJson<{ error: string }>(response).error).toBe('theme_kids_friendly_invalid')
    expect(stored(3).kids_friendly).toBeUndefined()
  })

  it('does not let a company admin flag a theme of another company or a global theme', async () => {
    const otherCompany = await send('PATCH', '/themes/5', { kidsFriendly: true })
    const global = await send('PATCH', '/themes/1', { kidsFriendly: true })

    expect(otherCompany.statusCode).toBe(403)
    expect(global.statusCode).toBe(403)
    expect(stored(5).kids_friendly).toBeUndefined()
    expect(stored(1).kids_friendly).toBeUndefined()
  })

  it('lets a superadmin flag a global theme', async () => {
    const response = await send('PATCH', '/themes/1', { kidsFriendly: true }, superadminUser)

    expect(response.statusCode).toBe(200)
    expect(stored(1).kids_friendly).toBe(true)
  })
})

describe('GET /themes — kidsFriendly', () => {
  it('returns the flag on the sheet and in the list, for the themes the company can see', async () => {
    stored(3).kids_friendly = true
    stored(5).kids_friendly = true

    const sheet = await send('GET', '/themes/3')
    const list = await send('GET', '/themes')
    const foreign = await send('GET', '/themes/5')

    expect(parseJson<ThemePayload>(sheet).theme.kidsFriendly).toBe(true)

    const themes = parseJson<{ themes: Array<{ id: number; kidsFriendly?: boolean }> }>(list).themes

    expect(themes.find((theme) => theme.id === 3)?.kidsFriendly).toBe(true)
    expect(themes.some((theme) => theme.id === 5)).toBe(false)
    expect(foreign.statusCode).toBe(403)
  })
})
