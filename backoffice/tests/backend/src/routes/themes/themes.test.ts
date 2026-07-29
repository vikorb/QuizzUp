import '../_helpers/registerRouteMocks'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  THEME_MODE_CLASSIC,
  THEME_MODE_IMAGE,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
} from '@quizzup/shared'
import themesRoutes from '@backend/routes/themes'
import { dbState } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import { securityState } from '../_helpers/mockSecurity'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  parseJson,
  superadminUser,
} from '../_helpers/testApp'
import { seedThemesData } from './_fixtures'

resetRouteMocksBeforeEach()

beforeEach(() => {
  seedThemesData()
})

type ThemePayload = {
  id: number
  scope: string
  companyId: number | null
  status: number
  mode: string
  questionsCount?: number
}

function themeBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'New theme',
    mode: THEME_MODE_CLASSIC,
    ...overrides,
  }
}

function listThemes(url = '/themes', user = superadminUser) {
  return createRouteApp(themesRoutes).then(async (app) => {
    const response = await app.inject({ method: 'GET', url, headers: authHeaders(user) })
    await app.close()

    return response
  })
}

describe('routes/themes.ts (list)', () => {
  it('requires authentication to list themes', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({ method: 'GET', url: '/themes' })

    expect(response.statusCode).toBe(401)

    await app.close()
  })

  it('rejects listing without API permission', async () => {
    securityState.hasPermission = false
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/themes',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(403)

    await app.close()
  })

  it('lets superadmins list every non-deleted theme with the linked-questions count', async () => {
    const response = await listThemes('/themes', superadminUser)

    expect(response.statusCode).toBe(200)

    const body = parseJson<{ themes: ThemePayload[] }>(response)

    // Tous sauf le thème 6 (supprimé), triés par id.
    expect(body.themes.map((theme) => theme.id)).toEqual([1, 2, 3, 4, 5, 7])

    const globalA = body.themes.find((theme) => theme.id === 1)
    const company1A = body.themes.find((theme) => theme.id === 3)

    expect(globalA?.questionsCount).toBe(1)
    expect(company1A?.questionsCount).toBe(2)
  })

  it('limits visibility to global and own-company themes for non-superadmins', async () => {
    const response = await listThemes('/themes', companyAdminUser)

    const body = parseJson<{ themes: ThemePayload[] }>(response)

    // Globaux (1,2) + compagnie 1 (3,4,7) ; ni la compagnie 2 (5) ni le supprimé (6).
    expect(body.themes.map((theme) => theme.id)).toEqual([1, 2, 3, 4, 7])
  })

  it('returns the soft-deleted themes when the status filter targets them', async () => {
    const response = await listThemes('/themes?status=2', superadminUser)

    const body = parseJson<{ themes: ThemePayload[] }>(response)

    expect(body.themes.map((theme) => theme.id)).toEqual([6])
    expect(body.themes.every((theme) => theme.status === THEME_STATUS_DELETED)).toBe(true)
  })

  it('filters by search on the name and keeps deleted themes excluded by default', async () => {
    const response = await listThemes('/themes?search=Global', superadminUser)

    const body = parseJson<{ themes: ThemePayload[] }>(response)

    // "Deleted Global" contient bien "Global" mais reste exclu (statut supprimé).
    expect(body.themes.map((theme) => theme.id)).toEqual([1, 2])
  })

  it('filters by mode', async () => {
    const response = await listThemes(`/themes?mode=${THEME_MODE_IMAGE}`, superadminUser)

    const body = parseJson<{ themes: ThemePayload[] }>(response)

    expect(body.themes.map((theme) => theme.id)).toEqual([2])
  })

  it('filters by scope', async () => {
    const response = await listThemes(`/themes?scope=${THEME_SCOPE_COMPANY}`, superadminUser)

    const body = parseJson<{ themes: ThemePayload[] }>(response)

    expect(body.themes.map((theme) => theme.id)).toEqual([3, 4, 5, 7])
  })
})

describe('routes/themes.ts (create)', () => {
  it('rejects theme creation without API permission', async () => {
    securityState.hasPermission = false
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/themes',
      headers: authHeaders(superadminUser),
      payload: themeBody(),
    })

    expect(response.statusCode).toBe(403)

    await app.close()
  })

  it('requires a theme name', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/themes',
      headers: authHeaders(superadminUser),
      payload: themeBody({ name: '   ' }),
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'theme_name_required' })

    await app.close()
  })

  it('rejects an invalid mode', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/themes',
      headers: authHeaders(superadminUser),
      payload: themeBody({ mode: 'nope' }),
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'theme_mode_invalid' })

    await app.close()
  })

  it('requires a company when a superadmin targets a company scope without company id', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/themes',
      headers: authHeaders(superadminUser),
      payload: themeBody({ scope: THEME_SCOPE_COMPANY }),
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'theme_company_required' })

    await app.close()
  })

  it('forces the company scope and pins the company for an establishment admin', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/themes',
      headers: authHeaders(companyAdminUser),
      // Le scope global demandé est ignoré : un admin reste sur sa compagnie.
      payload: themeBody({ scope: THEME_SCOPE_GLOBAL, companyId: 999 }),
    })

    expect(response.statusCode).toBe(201)

    const body = parseJson<{ theme: ThemePayload }>(response)

    expect(body.theme).toMatchObject({
      scope: THEME_SCOPE_COMPANY,
      companyId: 1,
      status: THEME_STATUS_ACTIVE,
    })

    await app.close()
  })

  it('lets a superadmin create a global theme by default', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/themes',
      headers: authHeaders(superadminUser),
      payload: themeBody(),
    })

    expect(response.statusCode).toBe(201)

    const body = parseJson<{ theme: ThemePayload }>(response)

    expect(body.theme).toMatchObject({
      scope: THEME_SCOPE_GLOBAL,
      companyId: null,
      status: THEME_STATUS_ACTIVE,
    })

    await app.close()
  })

  it('creates a draft theme for a plain user', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/themes',
      headers: authHeaders(companyUser),
      payload: themeBody(),
    })

    expect(response.statusCode).toBe(201)

    const body = parseJson<{ theme: ThemePayload }>(response)

    expect(body.theme).toMatchObject({
      scope: THEME_SCOPE_COMPANY,
      companyId: 2,
      status: THEME_STATUS_DRAFT,
    })

    // Persisté en base.
    expect(dbState.themes.some((theme) => theme.id === body.theme.id)).toBe(true)

    await app.close()
  })
})
