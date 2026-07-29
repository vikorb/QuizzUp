import '../_helpers/registerRouteMocks'

import { beforeEach, describe, expect, it } from 'vitest'

import { THEME_STATUS_INACTIVE } from '@quizzup/shared'
import themesRoutes from '@backend/routes/themes'
import { dbState } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
} from '../_helpers/testApp'
import { seedThemesData } from './_fixtures'

resetRouteMocksBeforeEach()

beforeEach(() => {
  seedThemesData()
})

type ThemePayload = { id: number; status: number }

function storedTheme(id: number): Record<string, unknown> | undefined {
  return dbState.themes.find((theme) => theme.id === id)
}

describe('routes/themes/idStatus.ts', () => {
  it('updates the status of an editable theme', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/themes/3/status',
      headers: authHeaders(companyAdminUser),
      payload: { status: THEME_STATUS_INACTIVE },
    })

    expect(response.statusCode).toBe(200)

    const body = parseJson<{ theme: ThemePayload }>(response)

    expect(body.theme.status).toBe(THEME_STATUS_INACTIVE)
    expect(storedTheme(3)).toMatchObject({ status: THEME_STATUS_INACTIVE })

    await app.close()
  })

  it('lets a superadmin change the status of any theme', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/themes/5/status',
      headers: authHeaders(superadminUser),
      payload: { status: THEME_STATUS_INACTIVE },
    })

    expect(response.statusCode).toBe(200)

    await app.close()
  })

  it('rejects an invalid status', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/themes/3/status',
      headers: authHeaders(companyAdminUser),
      payload: { status: 99 },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'theme_status_invalid' })

    await app.close()
  })

  it('forbids changing the status of a global theme for an establishment admin', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/themes/1/status',
      headers: authHeaders(companyAdminUser),
      payload: { status: THEME_STATUS_INACTIVE },
    })

    expect(response.statusCode).toBe(403)

    await app.close()
  })
})
