import '../_helpers/registerRouteMocks'

import { beforeEach, describe, expect, it } from 'vitest'

import { THEME_MODE_AUDIO, THEME_STATUS_DELETED } from '@quizzup/shared'
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

type ThemePayload = { id: number; name: string; mode: string; status: number }
type QuestionPayload = { id: number; question: string; themeIds: number[] }

function storedTheme(id: number): Record<string, unknown> | undefined {
  return dbState.themes.find((theme) => theme.id === id)
}

function themeLinks(questionId: number): number[] {
  return dbState.question_themes
    .filter((link) => link.question_id === questionId)
    .map((link) => Number(link.theme_id))
}

describe('routes/themes/id.ts (read)', () => {
  it('lets an establishment admin read a global theme', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/themes/1',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(200)

    await app.close()
  })

  it('forbids reading a theme from another company', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/themes/5',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('returns 404 for an unknown theme', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/themes/999',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(404)

    await app.close()
  })

  it('lists the linked non-deleted questions of a theme', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/themes/3/questions',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(200)

    const body = parseJson<{ questions: QuestionPayload[] }>(response)

    // q2 et q4 sont liées au thème 3 ; q6 (supprimée) est exclue.
    expect(body.questions.map((question) => question.id)).toEqual([2, 4])

    await app.close()
  })
})

describe('routes/themes/id.ts (patch)', () => {
  it('updates the name and mode of an editable theme', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/themes/3',
      headers: authHeaders(companyAdminUser),
      payload: { name: '  Renamed  ', mode: THEME_MODE_AUDIO },
    })

    expect(response.statusCode).toBe(200)

    const body = parseJson<{ theme: ThemePayload }>(response)

    expect(body.theme).toMatchObject({ name: 'Renamed', mode: THEME_MODE_AUDIO })
    expect(storedTheme(3)).toMatchObject({ name: 'Renamed', mode: THEME_MODE_AUDIO })

    await app.close()
  })

  it('forbids an establishment admin from editing a global theme', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/themes/1',
      headers: authHeaders(companyAdminUser),
      payload: { name: 'Hacked' },
    })

    expect(response.statusCode).toBe(403)

    await app.close()
  })

  it('rejects an empty name', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/themes/3',
      headers: authHeaders(companyAdminUser),
      payload: { name: '   ' },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'theme_name_required' })

    await app.close()
  })

  it('rejects an invalid mode', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/themes/3',
      headers: authHeaders(companyAdminUser),
      payload: { mode: 'nope' },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'theme_mode_invalid' })

    await app.close()
  })
})

describe('routes/themes/id.ts (attach / detach)', () => {
  it('attaches a compatible company question to a company theme', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/themes/3/questions/5',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(200)
    expect(themeLinks(5)).toContain(3)

    await app.close()
  })

  it('rejects attaching a company question to a global theme (scope mismatch)', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/themes/1/questions/2',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_theme_scope_mismatch' })

    await app.close()
  })

  it('forbids attaching for a theme the requester cannot edit', async () => {
    const app = await createRouteApp(themesRoutes)

    // Le thème 1 est global : un admin d'établissement ne peut pas l'éditer.
    const response = await app.inject({
      method: 'POST',
      url: '/themes/1/questions/1',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(403)

    await app.close()
  })

  it('detaches a question that still has another theme', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/themes/3/questions/2',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(200)
    // q2 gardait les thèmes 3 et 4 ; il ne reste que le 4.
    expect(themeLinks(2)).toEqual([4])

    await app.close()
  })

  it('refuses to detach the last theme of a question', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/themes/3/questions/4',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_theme_last_link' })
    // Le lien est conservé.
    expect(themeLinks(4)).toEqual([3])

    await app.close()
  })
})

describe('routes/themes/id.ts (delete)', () => {
  it('soft-deletes an editable theme', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/themes/3',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(200)

    const body = parseJson<{ theme: ThemePayload }>(response)

    expect(body.theme.status).toBe(THEME_STATUS_DELETED)
    expect(storedTheme(3)).toMatchObject({ status: THEME_STATUS_DELETED })
    expect(storedTheme(3)?.deleted_at).not.toBeNull()

    await app.close()
  })

  it('forbids an establishment admin from deleting a global theme', async () => {
    const app = await createRouteApp(themesRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/themes/1',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(403)

    await app.close()
  })
})
