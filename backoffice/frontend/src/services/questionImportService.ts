import { THEME_SCOPE_COMPANY } from '@quizzup/shared'

import type {
  QuestionImportRequest,
  QuestionImportResult,
  QuestionImportRowError,
} from '@/types/questionImport'
import { apiFetch } from '@/utils/api'

type ImportFailure = Extract<QuestionImportResult, { ok: false }>

type ImportBody = {
  error?: unknown
  column?: unknown
  line?: unknown
  rows?: unknown
  valid?: unknown
  created?: unknown
  errors?: unknown
}

function failure(
  code: string,
  errors: QuestionImportRowError[] = [],
  params: ImportFailure['params'] = {}
): ImportFailure {
  return { ok: false, code, errors, params }
}

function readRowErrors(value: unknown): QuestionImportRowError[] {
  return Array.isArray(value) ? (value as QuestionImportRowError[]) : []
}

/** Code du serveur ; sans code, celui que le statut HTTP permet de déduire. */
function readFailure(status: number, body: ImportBody | null): ImportFailure {
  const code = typeof body?.error === 'string' ? body.error : null

  if (status === 413) {
    return failure('file_too_large')
  }

  if (status === 415) {
    return failure('csv_content_type_unsupported')
  }

  if (status === 401 || status === 403) {
    return failure(code ?? (status === 401 ? 'unauthorized' : 'forbidden'))
  }

  if (status >= 500 || code === null) {
    return failure('server_error')
  }

  const params: ImportFailure['params'] = {}

  if (typeof body?.column === 'string') {
    params.column = body.column
  }

  if (typeof body?.line === 'number') {
    params.line = body.line
  }

  return failure(code, readRowErrors(body?.errors), params)
}

/**
 * Envoie le fichier brut (`text/csv`, pas de multipart). `dryRun` joue toutes les vérifications du
 * serveur sans rien écrire ; sinon le serveur importe tout ou rien.
 */
export async function importQuestionsService(
  request: QuestionImportRequest
): Promise<QuestionImportResult> {
  const query = new URLSearchParams({ dryRun: String(request.dryRun) })

  if (request.scope) {
    query.set('scope', request.scope)
  }

  if (request.scope === THEME_SCOPE_COMPANY && request.companyId) {
    query.set('companyId', String(request.companyId))
  }

  const response = await apiFetch({
    path: `/questions/import?${query.toString()}`,
    method: 'POST',
    authenticated: true,
    headers: { 'Content-Type': 'text/csv' },
    body: request.file,
  })

  if (!response) {
    return failure('api_unreachable')
  }

  const body = (await response.json().catch(() => null)) as ImportBody | null

  if (!response.ok) {
    return readFailure(response.status, body)
  }

  if (request.dryRun && typeof body?.rows === 'number' && typeof body.valid === 'number') {
    return {
      ok: true,
      dryRun: true,
      rows: body.rows,
      valid: body.valid,
      errors: readRowErrors(body.errors),
    }
  }

  if (!request.dryRun && typeof body?.created === 'number') {
    return { ok: true, dryRun: false, created: body.created }
  }

  return failure('server_error')
}
