import '../_helpers/registerRouteMocks'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  QUESTION_KIND_ESTIMATE,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_STATUS_DELETED,
} from '@quizzup/shared'
import questionsRoutes from '@backend/routes/questions'
import { setMediaStorage } from '@backend/storage/mediaStorage'
import { dbState, lockedTables } from '../_helpers/mockDb'
import {
  jsonResponse,
  PROVIDER_ERROR_NOT_FOUND,
  providerTrack,
  stubProviderFetch,
  stubProviderTracks,
} from '../_helpers/mockMediaProvider'
import { createMemoryMediaStorage, type MemoryMediaStorage } from '../_helpers/memoryMediaStorage'
import { securityState } from '../_helpers/mockSecurity'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  parseJson,
  superadminUser,
} from '../_helpers/testApp'
import { seedQuestionsData } from './_fixtures'

const MP3_BYTES = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21])

let storage: MemoryMediaStorage

resetRouteMocksBeforeEach()

beforeEach(() => {
  seedQuestionsData()
  storage = createMemoryMediaStorage()
  setMediaStorage(storage)
})

afterEach(() => {
  setMediaStorage(null)
  vi.unstubAllGlobals()
})

function questionRow(id: number): Record<string, unknown> {
  const row = dbState.questions.find((question) => question.id === id)

  if (!row) {
    throw new Error(`question ${id} missing`)
  }

  return row
}

async function attach(
  questionId: number,
  body: unknown = { provider: 'deezer', ref: '3135556' },
  user = companyAdminUser
) {
  const app = await createRouteApp(questionsRoutes)
  const response = await app.inject({
    method: 'PUT',
    url: `/questions/${questionId}/media/provider`,
    headers: authHeaders(user),
    payload: (body ?? undefined) as object | undefined,
  })

  await app.close()

  return response
}

async function upload(questionId: number) {
  const app = await createRouteApp(questionsRoutes)
  const response = await app.inject({
    method: 'PUT',
    url: `/questions/${questionId}/media?rightsAttested=true&durationMs=45000`,
    headers: { ...authHeaders(companyAdminUser), 'content-type': 'audio/mpeg' },
    payload: MP3_BYTES,
  })

  await app.close()

  return response
}

async function call(method: 'GET' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const app = await createRouteApp(questionsRoutes)
  const response = await app.inject({
    method,
    url,
    headers: authHeaders(companyAdminUser),
    payload,
  })

  await app.close()

  return response
}

/** Question 2 déjà rattachée à un titre du fournisseur. */
function attachedToProvider(): void {
  Object.assign(questionRow(2), {
    type_media: QUESTION_MEDIA_TYPE_AUDIO,
    media_provider: 'deezer',
    media_provider_ref: '3135556',
    media_duration_ms: 30_000,
    media_original_name: 'Artiste — Titre',
  })
}

describe('routes/questions/mediaProvider — PUT /questions/:id/media/provider', () => {
  it('attaches the title: audio type, provider columns and duration, no url stored', async () => {
    const fetchMock = stubProviderTracks({ 3135556: providerTrack(3135556) })

    const response = await attach(2)

    expect(response.statusCode).toBe(200)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.deezer.com/track/3135556')

    const row = questionRow(2)
    expect(row).toMatchObject({
      type_media: QUESTION_MEDIA_TYPE_AUDIO,
      media_url: null,
      media_key: null,
      media_mime_type: null,
      media_size_bytes: null,
      media_provider: 'deezer',
      media_provider_ref: '3135556',
      media_duration_ms: 30_000,
      media_start_ms: 0,
      media_original_name: 'Artiste 3135556 — Titre 3135556',
      media_uploaded_by: 2,
      media_rights_attested_at: null,
    })
    expect(row.media_uploaded_at).not.toBeNull()
    expect(JSON.stringify(row)).not.toContain('hdnea')

    const { question } = parseJson<{ question: Record<string, unknown> }>(response)
    expect(question).toMatchObject({
      mediaProvider: 'deezer',
      mediaProviderRef: '3135556',
      mediaProviderLabel: 'Artiste 3135556 — Titre 3135556',
      mediaFile: null,
      mediaStartMs: 0,
      typeMedia: QUESTION_MEDIA_TYPE_AUDIO,
    })
    expect(JSON.stringify(question)).not.toContain('hdnea')
  })

  it('truncates the displayed name to 255 characters', async () => {
    stubProviderTracks({ 3135556: providerTrack(3135556, { title: 'T'.repeat(400) }) })

    await attach(2)

    expect(String(questionRow(2).media_original_name)).toHaveLength(255)
  })

  it('replaces an imported file: the file columns are emptied and the file is removed from storage', async () => {
    await upload(2)
    const key = String(questionRow(2).media_key)
    questionRow(2).media_start_ms = 12_000
    stubProviderTracks({ 3135556: providerTrack(3135556) })

    const response = await attach(2)

    expect(response.statusCode).toBe(200)
    expect(questionRow(2)).toMatchObject({
      media_key: null,
      media_mime_type: null,
      media_size_bytes: null,
      media_rights_attested_at: null,
      media_provider: 'deezer',
      media_start_ms: 0,
      media_duration_ms: 30_000,
    })
    expect(lockedTables).toContain('questions')
    expect(storage.removed).toEqual([key])
    expect(storage.files.has(key)).toBe(false)
  })

  it('replaces a title of the provider by another one', async () => {
    attachedToProvider()
    stubProviderTracks({ 42: providerTrack(42) })

    const response = await attach(2, { provider: 'deezer', ref: '42' })

    expect(response.statusCode).toBe(200)
    expect(questionRow(2)).toMatchObject({ media_provider: 'deezer', media_provider_ref: '42' })
    expect(storage.removed).toHaveLength(0)
  })

  it.each([
    ['no body', null],
    ['an unknown provider', { provider: 'spotify', ref: '1' }],
    ['no provider', { ref: '1' }],
    ['no ref', { provider: 'deezer' }],
    ['a ref that is not a string', { provider: 'deezer', ref: 3135556 }],
    ['a non numeric ref', { provider: 'deezer', ref: '12a' }],
    ['a ref that can escape the url', { provider: 'deezer', ref: '1/../../user/me' }],
    ['an empty ref', { provider: 'deezer', ref: '' }],
    ['a ref of 21 digits', { provider: 'deezer', ref: '1'.repeat(21) }],
  ])('answers 400 question_media_provider_invalid for %s', async (_label, body) => {
    const fetchMock = stubProviderTracks({})

    const response = await attach(2, body)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_media_provider_invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(questionRow(2).media_provider ?? null).toBeNull()
  })

  it('answers 404 question_media_provider_track_not_found for an unknown title', async () => {
    attachedToProvider()
    stubProviderFetch(() => jsonResponse(PROVIDER_ERROR_NOT_FOUND))

    const response = await attach(2, { provider: 'deezer', ref: '999' })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'question_media_provider_track_not_found' })
    expect(questionRow(2).media_provider_ref).toBe('3135556')
  })

  it('answers 409 question_media_provider_no_preview and keeps the current media', async () => {
    await upload(2)
    const key = String(questionRow(2).media_key)
    stubProviderTracks({ 3135556: providerTrack(3135556, { preview: '' }) })

    const response = await attach(2)

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'question_media_provider_no_preview' })
    expect(questionRow(2).media_key).toBe(key)
    expect(questionRow(2).media_provider ?? null).toBeNull()
    expect(storage.removed).toHaveLength(0)
  })

  it('answers 502 media_provider_unavailable when the provider fails, and changes nothing', async () => {
    await upload(2)
    const key = String(questionRow(2).media_key)

    for (const failure of [
      () => jsonResponse({}, 500),
      () => new Response('<html>', { status: 200 }),
      () => {
        throw new DOMException('timeout', 'TimeoutError')
      },
    ]) {
      stubProviderFetch(failure)

      const response = await attach(2)

      expect(response.statusCode).toBe(502)
      expect(parseJson(response)).toEqual({ error: 'media_provider_unavailable' })
    }

    expect(questionRow(2).media_key).toBe(key)
    expect(questionRow(2).media_provider ?? null).toBeNull()
    expect(storage.removed).toHaveLength(0)
  })

  it('refuses a question that is not a multiple-choice one, without calling the provider', async () => {
    questionRow(2).kind = QUESTION_KIND_ESTIMATE
    const fetchMock = stubProviderTracks({ 3135556: providerTrack(3135556) })

    const response = await attach(2)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_kind_media_invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(questionRow(2).media_provider ?? null).toBeNull()
  })

  it('checks the kind again under the lock when it changed during the provider call', async () => {
    stubProviderFetch(() => {
      questionRow(2).kind = QUESTION_KIND_ESTIMATE

      return jsonResponse(providerTrack(3135556))
    })

    const response = await attach(2)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_kind_media_invalid' })
    expect(questionRow(2).media_provider ?? null).toBeNull()
  })

  it('answers 404 question_not_found when the question was deleted during the provider call', async () => {
    stubProviderFetch(() => {
      questionRow(2).status = QUESTION_STATUS_DELETED

      return jsonResponse(providerTrack(3135556))
    })

    const response = await attach(2)

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'question_not_found' })
    expect(questionRow(2).media_provider ?? null).toBeNull()
  })

  it('answers 404 question_not_found for an unknown or a deleted question', async () => {
    stubProviderTracks({ 3135556: providerTrack(3135556) })

    for (const id of [999, 4]) {
      const response = await attach(id, undefined, superadminUser)

      expect(response.statusCode).toBe(404)
      expect(parseJson(response)).toEqual({ error: 'question_not_found' })
    }
  })

  it('answers 400 question_id_invalid for an invalid id', async () => {
    const response = await attach('abc' as unknown as number)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_id_invalid' })
  })

  it('refuses a question of another company without calling the provider', async () => {
    const fetchMock = stubProviderTracks({ 3135556: providerTrack(3135556) })

    const response = await attach(3)

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(questionRow(3).media_provider ?? null).toBeNull()
  })

  it('refuses a company admin on a global question, allows the superadmin', async () => {
    stubProviderTracks({ 3135556: providerTrack(3135556) })

    expect((await attach(1)).statusCode).toBe(403)
    expect((await attach(1, undefined, superadminUser)).statusCode).toBe(200)
    expect(questionRow(1).media_provider).toBe('deezer')
  })

  it('refuses roles without the update permission', async () => {
    securityState.hasPermission = false
    const fetchMock = stubProviderTracks({ 3135556: providerTrack(3135556) })

    const response = await attach(2, undefined, companyUser)

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a request that is not authenticated', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PUT',
      url: '/questions/2/media/provider',
      payload: { provider: 'deezer', ref: '1' },
    })

    await app.close()

    expect(response.statusCode).toBe(401)
  })
})

describe('routes/questions — every path that removes or replaces the media clears the provider', () => {
  it('importing a file replaces the provider title', async () => {
    attachedToProvider()

    const response = await upload(2)

    expect(response.statusCode).toBe(200)
    expect(questionRow(2)).toMatchObject({ media_provider: null, media_provider_ref: null })
    expect(questionRow(2).media_key).toMatch(/^questions\/2\//)
    expect(parseJson<{ question: Record<string, unknown> }>(response).question).toMatchObject({
      mediaProvider: null,
      mediaProviderRef: null,
      mediaProviderLabel: null,
    })
  })

  it('DELETE /media removes the provider title (there is no file to remove)', async () => {
    attachedToProvider()

    const response = await call('DELETE', '/questions/2/media')

    expect(response.statusCode).toBe(200)
    expect(questionRow(2)).toMatchObject({
      media_provider: null,
      media_provider_ref: null,
      media_duration_ms: null,
      media_start_ms: 0,
      media_original_name: null,
    })
    expect(storage.removed).toHaveLength(0)
    expect(parseJson<{ question: Record<string, unknown> }>(response).question).toMatchObject({
      mediaProvider: null,
      mediaProviderRef: null,
      typeMedia: QUESTION_MEDIA_TYPE_AUDIO,
    })
  })

  it('PATCH typeMedia away from audio removes the provider title', async () => {
    attachedToProvider()

    const response = await call('PATCH', '/questions/2', { typeMedia: QUESTION_MEDIA_TYPE_NONE })

    expect(response.statusCode).toBe(200)
    expect(questionRow(2)).toMatchObject({
      type_media: QUESTION_MEDIA_TYPE_NONE,
      media_provider: null,
      media_provider_ref: null,
      media_duration_ms: null,
    })
  })

  it('PATCH keeps the provider title when the audio type is resent or the text changes', async () => {
    attachedToProvider()

    await call('PATCH', '/questions/2', { typeMedia: QUESTION_MEDIA_TYPE_AUDIO })
    await call('PATCH', '/questions/2', { question: 'Autre texte' })

    expect(questionRow(2)).toMatchObject({
      media_provider: 'deezer',
      media_provider_ref: '3135556',
    })
  })

  it('DELETE /media still answers 404 when the question has neither a file nor a title', async () => {
    const response = await call('DELETE', '/questions/2/media')

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'question_media_not_found' })
  })
})

describe('routes/questions — what the backoffice reads', () => {
  it('exposes mediaProvider, mediaProviderRef and mediaProviderLabel on the detail and the list, null otherwise', async () => {
    attachedToProvider()

    const detail = await call('GET', '/questions/2')
    const other = await call('GET', '/questions/1')
    const list = await call('GET', '/questions')

    expect(parseJson<{ question: Record<string, unknown> }>(detail).question).toMatchObject({
      mediaProvider: 'deezer',
      mediaProviderRef: '3135556',
      mediaProviderLabel: 'Artiste — Titre',
      mediaFile: null,
    })
    expect(parseJson<{ question: Record<string, unknown> }>(other).question).toMatchObject({
      mediaProvider: null,
      mediaProviderRef: null,
      mediaProviderLabel: null,
    })

    const { questions } = parseJson<{ questions: Array<Record<string, unknown>> }>(list)
    expect(questions.find((question) => question.id === 2)).toMatchObject({
      mediaProvider: 'deezer',
      mediaProviderRef: '3135556',
      mediaProviderLabel: 'Artiste — Titre',
    })
    expect(questions.find((question) => question.id === 1)).toMatchObject({
      mediaProvider: null,
      mediaProviderRef: null,
      mediaProviderLabel: null,
    })
  })

  it('never takes the file name of an imported file for a provider label', async () => {
    await upload(2)
    questionRow(2).media_original_name = 'extrait.mp3'

    const { question } = parseJson<{ question: Record<string, unknown> }>(
      await call('GET', '/questions/2')
    )

    expect(question.mediaFile).toMatchObject({ originalName: 'extrait.mp3' })
    expect(question.mediaProviderLabel).toBeNull()
  })

  it('GET /media (binary) still answers 404 question_media_not_found without a file', async () => {
    attachedToProvider()

    const response = await call('GET', '/questions/2/media')

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'question_media_not_found' })
  })
})
