import {
  getQuestionKindAnswersError,
  QUESTION_IMPORT_MAX_BYTES,
  type QuestionKind,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  buildImportTemplate,
  getImportTemplateRows,
  type ImportTemplateTexts,
  validateImportFile,
} from '@/utils/question/import'

const texts: ImportTemplateTexts = {
  theme: 'Culture générale',
  qcmQuestion: 'Quelle est la capitale de la France ?',
  trueFalseQuestion: 'La Terre est plate.',
  estimateQuestion: 'Quelle est la hauteur de la tour Eiffel, en mètres ?',
}

describe('utils/question/import — validateImportFile', () => {
  it('accepts a .csv file whatever its MIME type', () => {
    expect(validateImportFile({ name: 'questions.CSV', type: '', size: 10 })).toBeNull()
    expect(
      validateImportFile({ name: 'questions.csv', type: 'application/octet-stream', size: 10 })
    ).toBeNull()
  })

  it('accepts the CSV MIME types Windows gives to a file without extension', () => {
    expect(validateImportFile({ name: 'questions', type: 'text/csv', size: 10 })).toBeNull()
    expect(
      validateImportFile({ name: 'questions', type: 'application/vnd.ms-excel', size: 10 })
    ).toBeNull()
  })

  it('refuses another file type', () => {
    expect(
      validateImportFile({
        name: 'questions.xlsx',
        type: 'application/vnd.openxmlformats',
        size: 10,
      })
    ).toBe('csv_content_type_unsupported')
  })

  it('refuses an empty file', () => {
    expect(validateImportFile({ name: 'questions.csv', type: 'text/csv', size: 0 })).toBe(
      'csv_empty'
    )
  })

  it('refuses a file above the shared size limit, accepts one exactly at the limit', () => {
    expect(
      validateImportFile({ name: 'q.csv', type: 'text/csv', size: QUESTION_IMPORT_MAX_BYTES + 1 })
    ).toBe('file_too_large')
    expect(
      validateImportFile({ name: 'q.csv', type: 'text/csv', size: QUESTION_IMPORT_MAX_BYTES })
    ).toBeNull()
  })
})

describe('utils/question/import — template', () => {
  it('writes the BOM, the header and three example lines separated by CRLF', () => {
    const content = buildImportTemplate(texts)
    const lines = content.replace('\uFEFF', '').split('\r\n')

    expect(content.startsWith('\uFEFF')).toBe(true)
    expect(lines[0]).toBe(
      'theme;question;kind;answer_1;answer_2;answer_3;answer_4;correct;media_type;media_url'
    )
    expect(lines).toHaveLength(5)
    expect(lines[4]).toBe('')
  })

  it('gives every line as many fields as the header', () => {
    const rows = getImportTemplateRows(texts)

    expect(rows).toHaveLength(3)
    rows.forEach((row) => expect(row).toHaveLength(10))
  })

  it('quotes a field that holds the separator, a quote or a line break', () => {
    const content = buildImportTemplate({
      ...texts,
      qcmQuestion: 'Dire "oui" ; ou non ?',
      estimateQuestion: 'Ligne 1\nLigne 2',
    })

    expect(content).toContain('"Dire ""oui"" ; ou non ?"')
    expect(content).toContain('"Ligne 1\nLigne 2"')
    // Les textes sans séparateur restent tels quels.
    expect(content).toContain(';La Terre est plate.;')
  })

  it('only holds example answers that the shared rules accept for their kind', () => {
    for (const row of getImportTemplateRows(texts)) {
      const [, , kind, ...rest] = row
      const answers = rest.slice(0, 4)
      const correct = Number(rest[4])
      const filled = answers
        .map((response, index) => ({ response, isCorrect: index + 1 === correct }))
        .filter((answer) => answer.response !== '')

      expect(filled.filter((answer) => answer.isCorrect)).toHaveLength(1)
      expect(getQuestionKindAnswersError(kind as QuestionKind, filled)).toBeNull()
    }
  })
})
