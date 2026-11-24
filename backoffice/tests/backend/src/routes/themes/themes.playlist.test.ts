import '../_helpers/registerRouteMocks'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  THEME_MODE_AUDIO,
  THEME_MODE_CLASSIC,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
} from '@quizzup/shared'
import themesRoutes from '@backend/routes/themes'
import { dbState } from '../_helpers/mockDb'
import {
  jsonResponse,
  PROVIDER_ERROR_NOT_FOUND,
  providerTrack,
  stubProviderFetch,
} from '../_helpers/mockMediaProvider'
import { securityState } from '../_helpers/mockSecurity'
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

afterEach(() => {
  vi.unstubAllGlobals()
})

type ThemePayload = { id: number; mode: string; playlistRef: string | null }

const QUOTA_ERROR = { error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } }

/** Corps de `GET /playlist/<ref>/tracks` : `count` titres jouables, puis les titres donnés. */
function playlistBody(count: number, ...extra: Record<string, unknown>[]) {
  const playable = Array.from({ length: count }, (_value, index) => providerTrack(100 + index))

  return { data: [...playable, ...extra], total: playable.length + extra.length }
}

function stubPlaylist(body: unknown = playlistBody(4)) {
  return stubProviderFetch(() => jsonResponse(body))
}

function storedTheme(id: number): Record<string, unknown> {
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
  user = companyAdminUser
) {
  const app = await createRouteApp(themesRoutes)
  const response = await app.inject({ method, url, headers: authHeaders(user), payload })

  await app.close()

  return response
}

const create = (payload: Record<string, unknown>, user = companyAdminUser) =>
  send('POST', '/themes', { name: 'Rock', mode: THEME_MODE_AUDIO, ...payload }, user)

const patch = (id: number, payload: Record<string, unknown>, user = companyAdminUser) =>
  send('PATCH', `/themes/${id}`, payload, user)

describe('POST /themes avec une playlist', () => {
  it('enregistre la playlist d’un thème audio de compagnie, après un seul appel au fournisseur', async () => {
    const fetchMock = stubPlaylist()

    const response = await create({ playlistRef: '1234' })

    expect(response.statusCode).toBe(201)

    const { theme } = parseJson<{ theme: ThemePayload }>(response)

    expect(theme.playlistRef).toBe('1234')
    expect(storedTheme(theme.id)).toMatchObject({
      scope: THEME_SCOPE_COMPANY,
      company_id: 1,
      playlist_provider: 'deezer',
      playlist_ref: '1234',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.deezer.com/playlist/1234/tracks?limit=500'
    )
  })

  it('enregistre la playlist d’un thème global créé par un superadmin', async () => {
    stubPlaylist()

    const response = await create({ playlistRef: '77' }, superadminUser)

    expect(response.statusCode).toBe(201)
    expect(storedTheme(parseJson<{ theme: ThemePayload }>(response).theme.id)).toMatchObject({
      scope: THEME_SCOPE_GLOBAL,
      playlist_ref: '77',
    })
  })

  it('compte seulement les titres lisibles avec un extrait en https', async () => {
    stubPlaylist(
      playlistBody(
        4,
        providerTrack(1, { readable: false }),
        providerTrack(2, { preview: '' }),
        providerTrack(3, { preview: 'http://cdn.test/3.mp3' })
      )
    )

    expect((await create({ playlistRef: '5' })).statusCode).toBe(201)
  })

  it('refuse une playlist de moins de 4 titres jouables (422 theme_playlist_too_small)', async () => {
    stubPlaylist(
      playlistBody(
        3,
        providerTrack(1, { readable: false }),
        providerTrack(2, { preview: '' }),
        providerTrack(3, { preview: 'http://cdn.test/3.mp3' })
      )
    )
    const before = dbState.themes.length

    const response = await create({ playlistRef: '5' })

    expect(response.statusCode).toBe(422)
    expect(parseJson(response)).toEqual({ error: 'theme_playlist_too_small' })
    expect(dbState.themes).toHaveLength(before)
  })

  it('refuse une playlist inconnue (422 theme_playlist_not_found), sans rien enregistrer', async () => {
    stubPlaylist(PROVIDER_ERROR_NOT_FOUND)
    const before = dbState.themes.length

    const response = await create({ playlistRef: '5' })

    expect(response.statusCode).toBe(422)
    expect(parseJson(response)).toEqual({ error: 'theme_playlist_not_found' })
    expect(dbState.themes).toHaveLength(before)
  })

  it('répond 502 media_provider_unavailable sur un quota dépassé ou un délai', async () => {
    const before = dbState.themes.length

    stubPlaylist(QUOTA_ERROR)
    const quota = await create({ playlistRef: '5' })

    stubProviderFetch(() => {
      throw new DOMException('timeout', 'TimeoutError')
    })
    const timeout = await create({ playlistRef: '5' })

    expect([quota.statusCode, timeout.statusCode]).toEqual([502, 502])
    expect(parseJson(quota)).toEqual({ error: 'media_provider_unavailable' })
    expect(parseJson(timeout)).toEqual({ error: 'media_provider_unavailable' })
    expect(dbState.themes).toHaveLength(before)
  })

  it.each(['12a', '', '1'.repeat(21), 12])(
    'refuse la référence %j sans appeler le fournisseur (400 theme_playlist_ref_invalid)',
    async (playlistRef) => {
      const fetchMock = stubPlaylist()

      const response = await create({ playlistRef })

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'theme_playlist_ref_invalid' })
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('refuse une playlist hors du mode audio (400 theme_playlist_mode_invalid)', async () => {
    const fetchMock = stubPlaylist()

    const response = await create({ mode: THEME_MODE_CLASSIC, playlistRef: '5' })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'theme_playlist_mode_invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('crée sans playlist quand playlistRef est absent ou null, sans appeler le fournisseur', async () => {
    const fetchMock = stubPlaylist()

    const absent = await create({})
    const nul = await create({ playlistRef: null, mode: THEME_MODE_CLASSIC })

    expect([absent.statusCode, nul.statusCode]).toEqual([201, 201])
    expect(parseJson<{ theme: ThemePayload }>(nul).theme.playlistRef).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('applique les droits du thème : refus sans permission, avant tout appel', async () => {
    securityState.hasPermission = false
    const fetchMock = stubPlaylist()

    const response = await create({ playlistRef: '5' })

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('PATCH /themes/:id avec une playlist', () => {
  beforeEach(() => {
    // Thème 4 : audio, compagnie 1.
    Object.assign(storedTheme(4), { playlist_provider: 'deezer', playlist_ref: '99' })
  })

  it('remplace la playlist après contrôle', async () => {
    const fetchMock = stubPlaylist()

    const response = await patch(4, { playlistRef: '2024' })

    expect(response.statusCode).toBe(200)
    expect(parseJson<{ theme: ThemePayload }>(response).theme.playlistRef).toBe('2024')
    expect(storedTheme(4)).toMatchObject({ playlist_provider: 'deezer', playlist_ref: '2024' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/playlist/2024/tracks')
  })

  it('efface la playlist avec null, sans appeler le fournisseur', async () => {
    const fetchMock = stubPlaylist()

    const response = await patch(4, { playlistRef: null })

    expect(response.statusCode).toBe(200)
    expect(parseJson<{ theme: ThemePayload }>(response).theme.playlistRef).toBeNull()
    expect(storedTheme(4)).toMatchObject({ playlist_provider: null, playlist_ref: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('garde la playlist quand le corps ne la mentionne pas', async () => {
    const fetchMock = stubPlaylist()

    const response = await patch(4, { name: 'Renommé' })

    expect(response.statusCode).toBe(200)
    expect(storedTheme(4)).toMatchObject({ name: 'Renommé', playlist_ref: '99' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('efface la playlist d’un thème qui quitte le mode audio', async () => {
    const response = await patch(4, { mode: THEME_MODE_CLASSIC })

    expect(response.statusCode).toBe(200)
    expect(storedTheme(4)).toMatchObject({
      mode: THEME_MODE_CLASSIC,
      playlist_provider: null,
      playlist_ref: null,
    })
  })

  it('refuse une playlist demandée en même temps que la sortie du mode audio', async () => {
    const fetchMock = stubPlaylist()

    const response = await patch(4, { mode: THEME_MODE_CLASSIC, playlistRef: '5' })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'theme_playlist_mode_invalid' })
    expect(storedTheme(4)).toMatchObject({ mode: THEME_MODE_AUDIO, playlist_ref: '99' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuse une playlist sur un thème qui n’est pas en mode audio', async () => {
    stubPlaylist()

    const response = await patch(3, { playlistRef: '5' })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'theme_playlist_mode_invalid' })
    expect(storedTheme(3).playlist_ref).toBeUndefined()
  })

  it('accepte une playlist avec le passage au mode audio dans la même requête', async () => {
    stubPlaylist()

    const response = await patch(1, { mode: THEME_MODE_AUDIO, playlistRef: '8' }, superadminUser)

    expect(response.statusCode).toBe(200)
    expect(storedTheme(1)).toMatchObject({ mode: THEME_MODE_AUDIO, playlist_ref: '8' })
  })

  it.each([
    ['inconnue', PROVIDER_ERROR_NOT_FOUND, 422, 'theme_playlist_not_found'],
    ['trop petite', playlistBody(3), 422, 'theme_playlist_too_small'],
    ['en quota dépassé', QUOTA_ERROR, 502, 'media_provider_unavailable'],
  ])('refuse une playlist %s et garde l’ancienne', async (_label, body, status, error) => {
    stubPlaylist(body)

    const response = await patch(4, { playlistRef: '2024' })

    expect(response.statusCode).toBe(status)
    expect(parseJson(response)).toEqual({ error })
    expect(storedTheme(4)).toMatchObject({ playlist_provider: 'deezer', playlist_ref: '99' })
  })

  it('refuse (400) une référence invalide sans appeler le fournisseur', async () => {
    const fetchMock = stubPlaylist()

    const response = await patch(4, { playlistRef: 'abc' })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'theme_playlist_ref_invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('interdit à un admin de la compagnie A de modifier la playlist d’un thème de la compagnie B', async () => {
    Object.assign(storedTheme(5), { mode: THEME_MODE_AUDIO })
    const fetchMock = stubPlaylist()

    const response = await patch(5, { playlistRef: '5' })

    expect(response.statusCode).toBe(403)
    expect(storedTheme(5).playlist_ref).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('interdit à un admin de compagnie de modifier la playlist d’un thème global', async () => {
    Object.assign(storedTheme(1), { mode: THEME_MODE_AUDIO })
    const fetchMock = stubPlaylist()

    const response = await patch(1, { playlistRef: '5' })

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuse sans permission, avant tout appel', async () => {
    securityState.hasPermission = false
    const fetchMock = stubPlaylist()

    const response = await patch(4, { playlistRef: '5' })

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('lecture de playlistRef', () => {
  beforeEach(() => {
    Object.assign(storedTheme(4), { playlist_provider: 'deezer', playlist_ref: '99' })
  })

  it('GET /themes/:id renvoie la référence', async () => {
    const response = await send('GET', '/themes/4')

    expect(parseJson<{ theme: ThemePayload }>(response).theme.playlistRef).toBe('99')
  })

  it('GET /themes la renvoie pour le thème concerné', async () => {
    const response = await send('GET', '/themes')
    const { themes } = parseJson<{ themes: ThemePayload[] }>(response)

    expect(themes.find((theme) => theme.id === 4)?.playlistRef).toBe('99')
  })
})
