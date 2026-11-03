import '../_helpers/registerRouteMocks'

import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QUESTION_MEDIA_TYPE_AUDIO, QUESTION_MEDIA_TYPE_NONE } from '@quizzup/shared'
import questionsRoutes from '@backend/routes/questions'
import { type MediaStorage, setMediaStorage } from '@backend/storage/mediaStorage'
import { dbState } from '../_helpers/mockDb'
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
const OGG_BYTES = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00])

type MemoryStorage = MediaStorage & { files: Map<string, Buffer>; removed: string[] }

function createMemoryStorage(): MemoryStorage {
  const files = new Map<string, Buffer>()
  const removed: string[] = []

  return {
    files,
    removed,
    async save(key, content) {
      files.set(key, Buffer.from(content))
    },
    async read(key) {
      const content = files.get(key)

      return content ? { stream: Readable.from(content), size: content.length } : null
    },
    async remove(key) {
      removed.push(key)
      files.delete(key)
    },
  }
}

let storage: MemoryStorage

resetRouteMocksBeforeEach()

beforeEach(() => {
  seedQuestionsData()
  storage = createMemoryStorage()
  setMediaStorage(storage)
})

afterEach(() => {
  setMediaStorage(null)
})

function questionRow(id: number): Record<string, unknown> {
  const row = dbState.questions.find((question) => question.id === id)

  if (!row) {
    throw new Error(`question ${id} missing`)
  }

  return row
}

async function upload(
  questionId: number,
  options: {
    body?: Buffer
    contentType?: string
    query?: string
    user?: typeof superadminUser
  } = {}
) {
  const app = await createRouteApp(questionsRoutes)
  const query =
    options.query ?? 'rightsAttested=true&durationMs=45000&fileName=extrait%20%C3%A9t%C3%A9.mp3'

  const response = await app.inject({
    method: 'PUT',
    url: `/questions/${questionId}/media?${query}`,
    headers: {
      ...authHeaders(options.user ?? companyAdminUser),
      'content-type': options.contentType ?? 'audio/mpeg',
    },
    payload: options.body ?? MP3_BYTES,
  })

  await app.close()

  return response
}

describe('routes/questions/media — upload', () => {
  it('stores the file, switches the question to audio and exposes a protected url', async () => {
    const response = await upload(2)

    expect(response.statusCode).toBe(200)

    const { question } = parseJson<{ question: Record<string, unknown> }>(response)
    const row = questionRow(2)

    expect(row.type_media).toBe(QUESTION_MEDIA_TYPE_AUDIO)
    expect(row.media_key).toMatch(/^questions\/2\/[0-9a-f-]{36}\.mp3$/)
    expect(row.media_mime_type).toBe('audio/mpeg')
    expect(row.media_size_bytes).toBe(MP3_BYTES.length)
    expect(row.media_duration_ms).toBe(45_000)
    expect(row.media_original_name).toBe('extrait été.mp3')
    expect(row.media_uploaded_by).toBe(2)
    expect(row.media_rights_attested_at).not.toBeNull()
    expect(storage.files.get(String(row.media_key))).toEqual(MP3_BYTES)

    expect(question).not.toHaveProperty('mediaKey')
    expect(question.mediaStartMs).toBe(0)
    expect(question.mediaFile).toMatchObject({
      url: `/questions/2/media?v=${String(row.media_key).split('/').pop()?.replace('.mp3', '')}`,
      mimeType: 'audio/mpeg',
      sizeBytes: MP3_BYTES.length,
      durationMs: 45_000,
      originalName: 'extrait été.mp3',
    })
  })

  it('accepts ogg files and the non standard audio/mp3 alias', async () => {
    const ogg = await upload(2, { body: OGG_BYTES, contentType: 'audio/ogg' })
    expect(ogg.statusCode).toBe(200)
    expect(questionRow(2).media_key).toMatch(/\.ogg$/)

    const mp3 = await upload(2, { contentType: 'audio/mp3' })
    expect(mp3.statusCode).toBe(200)
    expect(questionRow(2).media_mime_type).toBe('audio/mpeg')
  })

  it('replaces a previous file and removes it from storage', async () => {
    await upload(2)
    const firstKey = String(questionRow(2).media_key)

    await upload(2, { body: OGG_BYTES, contentType: 'audio/ogg' })
    const secondKey = String(questionRow(2).media_key)

    expect(secondKey).not.toBe(firstKey)
    expect(storage.removed).toContain(firstKey)
    expect(storage.files.has(firstKey)).toBe(false)
    expect(storage.files.has(secondKey)).toBe(true)
  })

  it('changes the playback url on each upload so no cache serves the old excerpt', async () => {
    const first = parseJson<{ question: { mediaFile: { url: string } } }>(await upload(2))
    const second = parseJson<{ question: { mediaFile: { url: string } } }>(await upload(2))

    expect(first.question.mediaFile.url).toMatch(/^\/questions\/2\/media\?v=[0-9a-f-]{36}$/)
    expect(second.question.mediaFile.url).not.toBe(first.question.mediaFile.url)
  })

  it('rejects unauthenticated uploads before reading the body', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PUT',
      url: '/questions/2/media?rightsAttested=true',
      headers: { 'content-type': 'audio/mpeg' },
      payload: MP3_BYTES,
    })

    await app.close()

    expect(response.statusCode).toBe(401)
    expect(storage.files.size).toBe(0)
  })

  it('keeps the start point when it still fits in the new file, resets it otherwise', async () => {
    questionRow(2).media_start_ms = 30_000

    await upload(2, { query: 'rightsAttested=true&durationMs=60000' })
    expect(questionRow(2).media_start_ms).toBe(30_000)

    await upload(2, { query: 'rightsAttested=true&durationMs=10000' })
    expect(questionRow(2).media_start_ms).toBe(0)
  })

  it('requires the rights attestation', async () => {
    const response = await upload(2, { query: 'durationMs=1000' })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_media_rights_required' })
    expect(storage.files.size).toBe(0)
  })

  it('rejects a file whose content is not the announced audio format', async () => {
    const response = await upload(2, { body: Buffer.from('<html>not audio</html>') })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_media_invalid_file' })
    expect(storage.files.size).toBe(0)
  })

  it('rejects unsupported content types', async () => {
    const response = await upload(2, { contentType: 'audio/wav' })

    expect(response.statusCode).toBe(415)
  })

  it('rejects an invalid duration', async () => {
    const response = await upload(2, { query: 'rightsAttested=true&durationMs=-5' })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_media_duration_invalid' })
  })

  it('rejects files over the size limit', async () => {
    const previous = process.env.MEDIA_MAX_BYTES
    process.env.MEDIA_MAX_BYTES = '16'

    try {
      const response = await upload(2, { body: Buffer.concat([MP3_BYTES, Buffer.alloc(32)]) })

      expect(response.statusCode).toBe(413)
      expect(storage.files.size).toBe(0)
    } finally {
      if (previous === undefined) {
        delete process.env.MEDIA_MAX_BYTES
      } else {
        process.env.MEDIA_MAX_BYTES = previous
      }
    }
  })

  it('refuses a question the admin cannot edit', async () => {
    const response = await upload(3)

    expect(response.statusCode).toBe(403)
    expect(storage.files.size).toBe(0)
  })

  it('refuses a deleted question', async () => {
    const response = await upload(4, { user: superadminUser })

    expect(response.statusCode).toBe(404)
  })

  it('refuses roles without the update permission', async () => {
    securityState.hasPermission = false

    const response = await upload(3, { user: companyUser })

    expect(response.statusCode).toBe(403)
    expect(storage.files.size).toBe(0)
  })

  it('answers 404 for an unknown question without storing anything', async () => {
    const response = await upload(999, { user: superadminUser })

    expect(response.statusCode).toBe(404)
    expect(storage.files.size).toBe(0)
  })
})

describe('routes/questions/media — read', () => {
  async function read(questionId: number, headers: Record<string, string> = {}) {
    const app = await createRouteApp(questionsRoutes)
    const response = await app.inject({
      method: 'GET',
      url: `/questions/${questionId}/media`,
      headers: { ...authHeaders(companyAdminUser), ...headers },
    })

    await app.close()

    return response
  }

  it('streams the stored file with its content type and cache headers', async () => {
    await upload(2)

    const response = await read(2)

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('audio/mpeg')
    expect(response.headers['content-length']).toBe(String(MP3_BYTES.length))
    expect(response.headers['cache-control']).toBe('private, no-cache')
    expect(response.headers.vary).toBe('Authorization')
    expect(response.rawPayload).toEqual(MP3_BYTES)
  })

  it('answers 304 when the browser already has this version', async () => {
    await upload(2)
    const first = await read(2)

    const second = await read(2, { 'if-none-match': String(first.headers.etag) })

    expect(second.statusCode).toBe(304)
  })

  it('answers 404 when the question has no file', async () => {
    const response = await read(2)

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'question_media_not_found' })
  })

  it('no longer serves the file of a deleted question', async () => {
    await upload(2)
    questionRow(2).status = 2

    const response = await read(2)

    expect(response.statusCode).toBe(404)
  })

  it('refuses to serve a question of another company', async () => {
    await upload(3, { user: superadminUser })

    const response = await read(3)

    expect(response.statusCode).toBe(403)
  })

  it('answers 404 when the file vanished from storage', async () => {
    await upload(2)
    storage.files.clear()

    const response = await read(2)

    expect(response.statusCode).toBe(404)
  })
})

describe('routes/questions/media — delete', () => {
  it('detaches the file and removes it from storage', async () => {
    await upload(2)
    const key = String(questionRow(2).media_key)
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/questions/2/media',
      headers: authHeaders(companyAdminUser),
    })

    await app.close()

    expect(response.statusCode).toBe(200)
    expect(questionRow(2).media_key).toBeNull()
    expect(questionRow(2).media_start_ms).toBe(0)
    expect(storage.files.has(key)).toBe(false)
    expect(parseJson<{ question: { mediaFile: unknown } }>(response).question.mediaFile).toBeNull()
  })

  it('answers 404 when there is nothing to delete', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/questions/2/media',
      headers: authHeaders(companyAdminUser),
    })

    await app.close()

    expect(response.statusCode).toBe(404)
  })
})

describe('routes/questions — mediaStartMs', () => {
  async function patchStart(questionId: number, mediaStartMs: unknown) {
    const app = await createRouteApp(questionsRoutes)
    const response = await app.inject({
      method: 'PATCH',
      url: `/questions/${questionId}`,
      headers: authHeaders(companyAdminUser),
      payload: { mediaStartMs },
    })

    await app.close()

    return response
  }

  it('updates the start point of the excerpt', async () => {
    await upload(2)

    const response = await patchStart(2, 12_500)

    expect(response.statusCode).toBe(200)
    expect(questionRow(2).media_start_ms).toBe(12_500)
    expect(parseJson<{ question: { mediaStartMs: number } }>(response).question.mediaStartMs).toBe(
      12_500
    )
  })

  it('rejects negative or non integer values', async () => {
    await upload(2)

    expect((await patchStart(2, -1)).statusCode).toBe(400)
    expect(parseJson(await patchStart(2, 1.5))).toEqual({ error: 'question_media_start_invalid' })
  })

  it('refuses a start point on a question without file', async () => {
    const response = await patchStart(2, 1000)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_media_not_found' })
  })

  it('detaches and removes the file when the question leaves the audio type', async () => {
    await upload(2)
    const key = String(questionRow(2).media_key)
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/2',
      headers: authHeaders(companyAdminUser),
      payload: { typeMedia: QUESTION_MEDIA_TYPE_NONE, mediaStartMs: 5000 },
    })

    await app.close()

    expect(response.statusCode).toBe(200)
    expect(questionRow(2).type_media).toBe(QUESTION_MEDIA_TYPE_NONE)
    expect(questionRow(2).media_key).toBeNull()
    expect(questionRow(2).media_start_ms).toBe(0)
    expect(storage.files.has(key)).toBe(false)
  })

  it('keeps the file when the audio type is resent', async () => {
    await upload(2)
    const app = await createRouteApp(questionsRoutes)

    await app.inject({
      method: 'PATCH',
      url: '/questions/2',
      headers: authHeaders(companyAdminUser),
      payload: { typeMedia: QUESTION_MEDIA_TYPE_AUDIO },
    })

    await app.close()

    expect(questionRow(2).media_key).not.toBeNull()
    expect(storage.files.size).toBe(1)
  })

  it('rolls back the whole update when the start point is refused', async () => {
    await upload(2)
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/2',
      headers: authHeaders(companyAdminUser),
      payload: { question: 'Nouveau texte', mediaStartMs: 999_999 },
    })

    await app.close()

    expect(response.statusCode).toBe(400)
    expect(questionRow(2).question).toBe('Company1 Q')
  })

  it('rejects a start point after the end of the file', async () => {
    await upload(2)

    const response = await patchStart(2, 45_000)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_media_start_out_of_range' })
  })

  it('lists questions without leaking the storage key', async () => {
    await upload(2)
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/questions',
      headers: authHeaders(companyAdminUser),
    })

    await app.close()

    const { questions } = parseJson<{ questions: Array<Record<string, unknown>> }>(response)
    const withMedia = questions.find((question) => question.id === 2)
    const withoutMedia = questions.find((question) => question.id === 1)

    expect(withMedia).not.toHaveProperty('mediaKey')
    expect(withMedia?.mediaFile).toMatchObject({
      url: expect.stringMatching(/^\/questions\/2\/media\?v=/),
    })
    expect(withoutMedia?.mediaFile).toBeNull()
    expect(withoutMedia?.typeMedia).toBe(QUESTION_MEDIA_TYPE_NONE)
  })
})
