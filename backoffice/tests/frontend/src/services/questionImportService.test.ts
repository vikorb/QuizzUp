import { THEME_SCOPE_COMPANY, THEME_SCOPE_GLOBAL } from '@quizzup/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ImportService from '@/services/questionImportService'
import type { QuestionImportRequest } from '@/types/questionImport'

const apiFetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/utils/api', () => ({
  apiFetch: apiFetchMock,
}))

// Le service est mocké globalement pour les composants : ici on teste le vrai module.
const service = await vi.importActual<typeof ImportService>('@/services/questionImportService')

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const csvFile = new File(['theme;question\n'], 'questions.csv', { type: 'text/csv' })

function importRequest(overrides: Partial<QuestionImportRequest> = {}): QuestionImportRequest {
  return { file: csvFile, dryRun: true, ...overrides }
}

function lastCall() {
  const options = apiFetchMock.mock.calls.at(-1)?.[0]

  return { options, url: new URL(`http://api${options.path}`) }
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe('services/questionImportService — request', () => {
  it('sends the raw file as text/csv with the dry-run flag', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse(200, { dryRun: true, rows: 1, valid: 1, errors: [] })
    )

    await service.importQuestionsService(importRequest())

    const { options, url } = lastCall()

    expect(url.pathname).toBe('/questions/import')
    expect(url.searchParams.get('dryRun')).toBe('true')
    expect(url.searchParams.has('scope')).toBe(false)
    expect(options).toMatchObject({
      method: 'POST',
      authenticated: true,
      headers: { 'Content-Type': 'text/csv' },
      body: csvFile,
    })
  })

  it('sends dryRun=false for the real import', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(201, { created: 2 }))

    await service.importQuestionsService(importRequest({ dryRun: false }))

    expect(lastCall().url.searchParams.get('dryRun')).toBe('false')
  })

  it('sends the company only with the company scope', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { rows: 1, valid: 1, errors: [] }))

    await service.importQuestionsService(
      importRequest({ scope: THEME_SCOPE_COMPANY, companyId: 7 })
    )
    expect(lastCall().url.searchParams.get('scope')).toBe('company')
    expect(lastCall().url.searchParams.get('companyId')).toBe('7')

    await service.importQuestionsService(importRequest({ scope: THEME_SCOPE_GLOBAL, companyId: 7 }))
    expect(lastCall().url.searchParams.get('scope')).toBe('global')
    expect(lastCall().url.searchParams.has('companyId')).toBe(false)
  })
})

describe('services/questionImportService — success', () => {
  it('returns the dry-run report with its line errors', async () => {
    const errors = [{ line: 3, column: 'theme', code: 'csv_theme_not_found' }]

    apiFetchMock.mockResolvedValue(jsonResponse(200, { dryRun: true, rows: 5, valid: 4, errors }))

    await expect(service.importQuestionsService(importRequest())).resolves.toEqual({
      ok: true,
      dryRun: true,
      rows: 5,
      valid: 4,
      errors,
    })
  })

  it('returns the number of created questions', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(201, { created: 12 }))

    await expect(service.importQuestionsService(importRequest({ dryRun: false }))).resolves.toEqual(
      {
        ok: true,
        dryRun: false,
        created: 12,
      }
    )
  })

  it('treats a success body of the wrong shape as a server error', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { created: 12 }))

    await expect(service.importQuestionsService(importRequest())).resolves.toMatchObject({
      ok: false,
      code: 'server_error',
    })
  })
})

describe('services/questionImportService — failures', () => {
  it('reports an unreachable API', async () => {
    apiFetchMock.mockResolvedValue(null)

    await expect(service.importQuestionsService(importRequest())).resolves.toMatchObject({
      ok: false,
      code: 'api_unreachable',
    })
  })

  it('maps 413 to file_too_large and 415 to csv_content_type_unsupported', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response('too big', { status: 413 }))
    await expect(service.importQuestionsService(importRequest())).resolves.toMatchObject({
      code: 'file_too_large',
    })

    apiFetchMock.mockResolvedValueOnce(jsonResponse(415, { error: 'csv_content_type_unsupported' }))
    await expect(service.importQuestionsService(importRequest())).resolves.toMatchObject({
      code: 'csv_content_type_unsupported',
    })
  })

  it('keeps the code and the line errors of a 422 refusal', async () => {
    const errors = [{ line: 2, column: 'question', code: 'csv_question_duplicate' }]

    apiFetchMock.mockResolvedValue(jsonResponse(422, { error: 'csv_invalid', errors }))

    await expect(service.importQuestionsService(importRequest({ dryRun: false }))).resolves.toEqual(
      { ok: false, code: 'csv_invalid', errors, params: {} }
    )
  })

  it('passes the column and the line of an unusable file to the text', async () => {
    apiFetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: 'csv_header_invalid', column: 'foo' })
    )
    await expect(service.importQuestionsService(importRequest())).resolves.toMatchObject({
      code: 'csv_header_invalid',
      params: { column: 'foo' },
    })

    apiFetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: 'csv_field_unterminated', line: 4 })
    )
    await expect(service.importQuestionsService(importRequest())).resolves.toMatchObject({
      code: 'csv_field_unterminated',
      params: { line: 4 },
    })
  })

  it('falls back on the HTTP status for 401 and 403 without code', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(service.importQuestionsService(importRequest())).resolves.toMatchObject({
      code: 'unauthorized',
    })

    apiFetchMock.mockResolvedValueOnce(new Response('', { status: 403 }))
    await expect(service.importQuestionsService(importRequest())).resolves.toMatchObject({
      code: 'forbidden',
    })
  })

  it('never shows a server message: a 5xx or a body without code is server_error', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'something_internal' }))
    await expect(service.importQuestionsService(importRequest())).resolves.toMatchObject({
      code: 'server_error',
    })

    apiFetchMock.mockResolvedValueOnce(new Response('<html>', { status: 502 }))
    await expect(service.importQuestionsService(importRequest())).resolves.toMatchObject({
      code: 'server_error',
    })

    apiFetchMock.mockResolvedValueOnce(jsonResponse(400, { message: 'oops' }))
    await expect(service.importQuestionsService(importRequest())).resolves.toMatchObject({
      code: 'server_error',
    })
  })
})
