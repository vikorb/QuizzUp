import { vi } from 'vitest'

import type {
  QuestionImportRequest,
  QuestionImportResult,
  QuestionImportRowError,
} from '@/types/questionImport'

export function createDryRunResult(
  errors: QuestionImportRowError[] = [],
  rows = 3
): QuestionImportResult {
  return { ok: true, dryRun: true, rows, valid: rows - errors.length, errors }
}

export const importQuestionsServiceMock = vi.fn(
  async (request: QuestionImportRequest): Promise<QuestionImportResult> =>
    request.dryRun ? createDryRunResult() : { ok: true, dryRun: false, created: 3 }
)

export function mockImportFailure(
  code: string,
  errors: QuestionImportRowError[] = [],
  params: Record<string, string | number> = {}
): void {
  importQuestionsServiceMock.mockResolvedValue({ ok: false, code, errors, params })
}

export function resetQuestionImportServiceMock(): void {
  importQuestionsServiceMock.mockReset()
  importQuestionsServiceMock.mockImplementation(async (request) =>
    request.dryRun ? createDryRunResult() : { ok: true, dryRun: false, created: 3 }
  )
}
