import '../_helpers/registerRouteMocks'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DRAFT,
  QUESTION_IMPORT_MAX_BYTES,
  QUESTION_IMPORT_MAX_ROWS,
  QUESTION_KIND_QCM,
  QUESTION_KIND_TRUE_FALSE,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DRAFT,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_DELETED,
} from '@quizzup/shared'
import questionsRoutes from '@backend/routes/questions'
import { dbState } from '../_helpers/mockDb'
import { requireApiPermissionMock, securityState } from '../_helpers/mockSecurity'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../_helpers/testApp'
import { seedQuestionsData } from './_fixtures'

resetRouteMocksBeforeEach()

beforeEach(() => {
  seedQuestionsData()
})

const HEADER =
  'theme;question;kind;answer_1;answer_2;answer_3;answer_4;correct;media_type;media_url'

type ImportError = { line: number; column: string | null; code: string }
type DryRunBody = {
  dryRun: boolean
  rows: number
  valid: number
  errors: ImportError[]
  questions: Array<{ line: number; question: string; kind: string; themeIds: number[] }>
}

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join('\n')
}

async function importCsv(
  payload: string | Buffer,
  options: { query?: string; user?: TestUser; contentType?: string } = {}
) {
  const app = await createRouteApp(questionsRoutes)

  try {
    return await app.inject({
      method: 'POST',
      url: `/questions/import${options.query ?? ''}`,
      headers: {
        ...authHeaders(options.user ?? superadminUser),
        'content-type': options.contentType ?? 'text/csv; charset=utf-8',
      },
      payload,
    })
  } finally {
    await app.close()
  }
}

/** Les tables que l'import écrit : elles doivent rester identiques quand rien ne doit l'être. */
function contentSnapshot() {
  return structuredClone({
    questions: dbState.questions,
    answers: dbState.answers,
    question_themes: dbState.question_themes,
  })
}

async function dryRunErrors(line: string, query = '?dryRun=true', user?: TestUser) {
  const response = await importCsv(csv(line), { query, user })

  expect(response.statusCode).toBe(200)

  return parseJson<DryRunBody>(response).errors
}

describe('POST /questions/import', () => {
  describe('accès', () => {
    it('requires authentication', async () => {
      const app = await createRouteApp(questionsRoutes)
      const response = await app.inject({
        method: 'POST',
        url: '/questions/import',
        headers: { 'content-type': 'text/csv' },
        payload: csv('Global A;Q ?;;Oui;Non;;;1'),
      })

      expect(response.statusCode).toBe(401)
      await app.close()
    })

    it('follows the question creation right and writes nothing without it', async () => {
      securityState.hasPermission = false
      const before = contentSnapshot()

      const response = await importCsv(csv('Global A;Q ?;;Oui;Non;;;1'))

      expect(response.statusCode).toBe(403)
      expect(parseJson(response)).toEqual({ error: 'forbidden' })
      expect(requireApiPermissionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'question',
        'create'
      )
      expect(contentSnapshot()).toEqual(before)
    })

    it('answers 403 before reading the body or looking at its type', async () => {
      securityState.hasPermission = false

      const tooBig = await importCsv(Buffer.alloc(QUESTION_IMPORT_MAX_BYTES + 1, 'a'))
      const wrongType = await importCsv('x', { contentType: 'application/octet-stream' })

      expect(tooBig.statusCode).toBe(403)
      expect(wrongType.statusCode).toBe(403)
    })

    it.each(['application/json', 'application/octet-stream', 'text/plain'])(
      'rejects a %s body with csv_content_type_unsupported',
      async (contentType) => {
        const before = contentSnapshot()
        const response = await importCsv(csv('Global A;Q ?;;Oui;Non;;;1'), { contentType })

        expect(response.statusCode).toBe(415)
        expect(parseJson(response)).toEqual({ error: 'csv_content_type_unsupported' })
        expect(contentSnapshot()).toEqual(before)
      }
    )

    it('accepts the type a Windows browser gives to a CSV opened with Excel', async () => {
      const response = await importCsv(csv('Global A;Q ?;;Oui;Non;;;1'), {
        contentType: 'application/vnd.ms-excel',
        query: '?dryRun=true',
      })

      expect(response.statusCode).toBe(200)
      expect(parseJson<DryRunBody>(response)).toMatchObject({ valid: 1, errors: [] })
    })

    it('rejects an invalid query', async () => {
      const response = await importCsv(csv('Global A;Q ?;;Oui;Non;;;1'), {
        query: '?dryRun=maybe',
      })

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toMatchObject({ error: 'invalid_query' })
    })

    it('rejects a body over the size limit', async () => {
      const response = await importCsv(Buffer.alloc(QUESTION_IMPORT_MAX_BYTES + 1, 'a'))

      expect(response.statusCode).toBe(413)
    })
  })

  describe('essai à blanc', () => {
    it('lists what would be created and the errors, and writes nothing', async () => {
      const before = contentSnapshot()

      const response = await importCsv(
        csv(
          'Global A;Capitale de la France ?;;Paris;Rome;;;1',
          'Global A|Global B;Vrai ou faux ?;true_false;Vrai;Faux;;;2',
          'Global A;Sans bonne réponse ?;;Oui;Non;;;3'
        ),
        { query: '?dryRun=true' }
      )

      expect(response.statusCode).toBe(200)
      expect(parseJson<DryRunBody>(response)).toEqual({
        dryRun: true,
        rows: 3,
        valid: 2,
        errors: [{ line: 4, column: 'correct', code: 'csv_correct_invalid' }],
        questions: [
          { line: 2, question: 'Capitale de la France ?', kind: QUESTION_KIND_QCM, themeIds: [1] },
          {
            line: 3,
            question: 'Vrai ou faux ?',
            kind: QUESTION_KIND_TRUE_FALSE,
            themeIds: [1, 2],
          },
        ],
      })
      expect(contentSnapshot()).toEqual(before)
    })

    it('reports at most 200 errors but counts every row', async () => {
      const lines = Array.from({ length: 250 }, () => ';Question ?;;Oui;Non;;;1')

      const response = await importCsv(csv(...lines), { query: '?dryRun=true' })
      const body = parseJson<DryRunBody>(response)

      expect(body.rows).toBe(250)
      expect(body.valid).toBe(0)
      expect(body.errors).toHaveLength(200)
      expect(body.errors[0]).toEqual({ line: 2, column: 'theme', code: 'question_theme_required' })
    })
  })

  describe('import', () => {
    it('creates the questions with their answers, themes and server-side statuses', async () => {
      const response = await importCsv(
        csv(
          'Global A;Capitale de la France ?;;Paris;Rome;Madrid;;1',
          'Global A|Global B;"Un ""vrai"" test,\navec retour";true_false;Vrai;Faux;;;1',
          'Global B;Voir ce logo;qcm;A;B;;;2;image;https://exemple.test/logo.png',
          ';;;;;;;;',
          ''
        )
      )

      expect(response.statusCode).toBe(201)
      expect(parseJson(response)).toEqual({ created: 3 })

      const created = dbState.questions.slice(4)

      expect(created).toHaveLength(3)
      expect(created[0]).toMatchObject({
        admin_id: 1,
        company_id: null,
        scope: THEME_SCOPE_GLOBAL,
        question: 'Capitale de la France ?',
        kind: QUESTION_KIND_QCM,
        type_media: QUESTION_MEDIA_TYPE_NONE,
        media_url: null,
        status: QUESTION_STATUS_ACTIVE,
      })
      expect(created[1]).toMatchObject({
        question: 'Un "vrai" test,\navec retour',
        kind: QUESTION_KIND_TRUE_FALSE,
      })
      expect(created[2]).toMatchObject({
        type_media: QUESTION_MEDIA_TYPE_IMAGE,
        media_url: 'https://exemple.test/logo.png',
      })

      const [first, second, third] = created.map((question) => question.id)
      const themesOf = (id: unknown) =>
        dbState.question_themes
          .filter((link) => link.question_id === id)
          .map((link) => link.theme_id)
          .sort()
      const answersOf = (id: unknown) =>
        dbState.answers
          .filter((answer) => answer.question_id === id)
          .map((answer) => [answer.response, answer.is_correct, answer.status])

      expect(themesOf(first)).toEqual([1])
      expect(themesOf(second)).toEqual([1, 2])
      expect(themesOf(third)).toEqual([2])
      expect(answersOf(first)).toEqual([
        ['Paris', true, ANSWER_STATUS_ACTIVE],
        ['Rome', false, ANSWER_STATUS_ACTIVE],
        ['Madrid', false, ANSWER_STATUS_ACTIVE],
      ])
      expect(answersOf(second)).toEqual([
        ['Vrai', true, ANSWER_STATUS_ACTIVE],
        ['Faux', false, ANSWER_STATUS_ACTIVE],
      ])
      expect(answersOf(third)).toEqual([
        ['A', false, ANSWER_STATUS_ACTIVE],
        ['B', true, ANSWER_STATUS_ACTIVE],
      ])
    })

    it('accepts several correct answers, a comma separator, a BOM and CRLF', async () => {
      const text =
        '﻿theme,question,answer_1,answer_2,answer_3,correct\r\n' +
        'global a,"Lesquelles ?",Un,Deux,Trois,"1|3"\r\n'

      const response = await importCsv(text)

      expect(response.statusCode).toBe(201)
      expect(
        dbState.answers.filter((answer) => answer.question_id === 5).map((a) => a.is_correct)
      ).toEqual([true, false, true])
    })

    it('stores questions and answers as drafts with draft=true', async () => {
      await importCsv(csv('Global A;Brouillon ?;;Oui;Non;;;1'), { query: '?draft=true' })

      expect(dbState.questions[4]).toMatchObject({ status: QUESTION_STATUS_DRAFT })
      expect(dbState.answers.at(-1)).toMatchObject({ status: ANSWER_STATUS_DRAFT })
    })
  })

  describe('atomicité', () => {
    it('writes nothing when one row among valid ones is invalid, and reports its line', async () => {
      const before = contentSnapshot()

      const response = await importCsv(
        csv(
          'Global A;Première ?;;Oui;Non;;;1',
          'Global A;"Deuxième\nsur deux lignes";;Oui;Non;;;9',
          'Global A;Troisième ?;;Oui;Non;;;1'
        )
      )

      expect(response.statusCode).toBe(422)
      expect(parseJson(response)).toEqual({
        error: 'csv_invalid',
        errors: [{ line: 3, column: 'correct', code: 'csv_correct_invalid' }],
      })
      expect(contentSnapshot()).toEqual(before)
    })

    it('numbers the lines after a multi-line field by their physical position', async () => {
      const errors = await dryRunErrors(
        'Global A;"a\nb\nc";;Oui;Non;;;1\nGlobal A;Mauvaise ?;;Oui;Non;;;7'
      )

      expect(errors).toEqual([{ line: 5, column: 'correct', code: 'csv_correct_invalid' }])
    })
  })

  describe('erreurs de ligne', () => {
    it.each([
      ['Inconnu;Q ?;;Oui;Non;;;1', 'theme', 'csv_theme_not_found'],
      [';Q ?;;Oui;Non;;;1', 'theme', 'question_theme_required'],
      ['Global A; ;;Oui;Non;;;1', 'question', 'question_required'],
      ['Global A;Q ?;riddle;Oui;Non;;;1', 'kind', 'question_kind_invalid'],
      ['Global A;Q ?;;Oui;Non;;;', 'correct', 'csv_correct_invalid'],
      ['Global A;Q ?;;Oui;Non;;;1|5', 'correct', 'csv_correct_invalid'],
      ['Global A;Q ?;;Oui;;;;', 'correct', 'csv_correct_invalid'],
      ['Global A;Q ?;;Oui;;;;1', 'answer_2', 'question_answers_min_required'],
      ['Global A;Q ?;true_false;Oui;Non;;;1', 'answer_1', 'question_true_false_answers_invalid'],
      ['Global A;Q ?;;Oui;Non;;;1;audio;', 'media_type', 'csv_audio_unsupported'],
      ['Global A;Q ?;;Oui;Non;;;1;image;', 'media_url', 'csv_media_url_required'],
      ['Global A;Q ?;;Oui;Non;;;1;image;ftp://x.test/a.png', 'media_url', 'csv_media_url_invalid'],
      ['Global A;Q ?;;Oui;Non;;;1;image;pas une adresse', 'media_url', 'csv_media_url_invalid'],
      ['Global A;Q ?;;Oui;Non;;;1;gif;', 'media_type', 'question_type_media_invalid'],
      [
        'Global A;Q ?;true_false;Vrai;Faux;;;1;video;https://x.test/v.mp4',
        'media_type',
        'question_kind_media_invalid',
      ],
      ['Global A;Q ?;;Oui;Non;;;1;;;extra', null, 'csv_too_many_columns'],
    ])('reports %j as column %s, code %s', async (line, column, code) => {
      const before = contentSnapshot()
      const errors = await dryRunErrors(line)

      expect(errors).toEqual([{ line: 2, column, code }])
      expect(contentSnapshot()).toEqual(before)
    })

    it('finds a theme whatever its case, and reports an ambiguous name', async () => {
      expect(await dryRunErrors('GLOBAL a;Q ?;;Oui;Non;;;1')).toEqual([])

      dbState.themes.push({ ...dbState.themes[1]!, id: 9, name: 'global a' })

      expect(await dryRunErrors('Global A;Q ?;;Oui;Non;;;1')).toEqual([
        { line: 2, column: 'theme', code: 'csv_theme_ambiguous' },
      ])
    })

    it('ignores deleted themes', async () => {
      dbState.themes[0]!.status = THEME_STATUS_DELETED

      expect(await dryRunErrors('Global A;Q ?;;Oui;Non;;;1')).toEqual([
        { line: 2, column: 'theme', code: 'csv_theme_not_found' },
      ])
    })
  })

  describe('doublons', () => {
    it('refuses a question already in the target theme, whatever its case and spacing', async () => {
      expect(await dryRunErrors('Global A;  global   q;;Oui;Non;;;1')).toEqual([
        { line: 2, column: 'question', code: 'csv_question_duplicate' },
      ])
    })

    it('accepts the same text in another theme, or one that only a deleted question holds', async () => {
      expect(await dryRunErrors('Global B;Global Q;;Oui;Non;;;1')).toEqual([])
      expect(await dryRunErrors('Global A;Deleted Q;;Oui;Non;;;1')).toEqual([])
    })

    it('refuses a repeat inside the file and keeps the first occurrence', async () => {
      const response = await importCsv(
        csv('Global A;Nouvelle ?;;Oui;Non;;;1', 'Global B|Global A;nouvelle ?;;Oui;Non;;;1'),
        { query: '?dryRun=true' }
      )

      expect(parseJson<DryRunBody>(response)).toMatchObject({
        valid: 1,
        errors: [{ line: 3, column: 'question', code: 'csv_question_duplicate' }],
      })
    })
  })

  describe('fichier inutilisable', () => {
    it.each([
      ['an empty file', '', 'csv_empty'],
      ['a header without data', HEADER, 'csv_empty'],
      ['only blank lines', '\n\n;;\n', 'csv_empty'],
      [
        'an unknown column',
        'theme;question;answer_1;answer_2;correct;auteur\nA;B;C;D;1;E',
        'csv_header_invalid',
      ],
      ['a missing column', 'theme;question;answer_1;answer_2\nA;B;C;D', 'csv_header_invalid'],
      [
        'a repeated column',
        'theme;question;answer_1;answer_2;correct;theme\nA;B;C;D;1;A',
        'csv_header_invalid',
      ],
    ])('answers 400 for %s', async (_label, text, code) => {
      const response = await importCsv(text)

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toMatchObject({ error: code })
    })

    it('names the offending column of a bad header, in any case or order', async () => {
      const unknown = await importCsv(
        'Question;THEME;answer_1;answer_2;correct;auteur\nA;B;C;D;1;E'
      )
      const missing = await importCsv('question;theme;answer_1;answer_2\nA;B;C;D')

      expect(parseJson(unknown)).toEqual({ error: 'csv_header_invalid', column: 'auteur' })
      expect(parseJson(missing)).toEqual({ error: 'csv_header_invalid', column: 'correct' })

      const reordered = await importCsv(
        'CORRECT;Answer_2;answer_1;QUESTION;theme\n1;Non;Oui;Q ?;Global A',
        { query: '?dryRun=true' }
      )

      expect(parseJson<DryRunBody>(reordered)).toMatchObject({ valid: 1, errors: [] })
    })

    it('reports an unterminated quoted field with its line', async () => {
      const response = await importCsv(csv('Global A;Q1 ?;;Oui;Non;;;1', 'Global A;"Q2 ?;;Oui;Non'))

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'csv_field_unterminated', line: 3 })
    })

    it('refuses a file that is not UTF-8', async () => {
      const response = await importCsv(Buffer.from([0x74, 0x3b, 0xe9, 0x0a, 0x31]))

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'csv_encoding_invalid' })
    })

    it('refuses a file holding a NUL byte, on the dry run as on the import', async () => {
      const text = csv('Global A;Troisi' + String.fromCharCode(0) + 'me ?;;Oui;Non;;;1')
      const before = contentSnapshot()

      for (const query of ['?dryRun=true', '']) {
        const response = await importCsv(text, { query })

        expect(response.statusCode).toBe(400)
        expect(parseJson(response)).toEqual({ error: 'csv_encoding_invalid' })
      }

      expect(contentSnapshot()).toEqual(before)
    })

    it('ignores the empty column names Excel appends to a header', async () => {
      const response = await importCsv(
        'theme;question;answer_1;answer_2;correct;;\nGlobal A;Q ?;Oui;Non;1;;',
        { query: '?dryRun=true' }
      )

      expect(parseJson<DryRunBody>(response)).toMatchObject({ valid: 1, errors: [] })
    })

    it('still refuses an empty column name inside the header', async () => {
      const response = await importCsv(
        'theme;question;;answer_1;answer_2;correct\nGlobal A;Q ?;;Oui;Non;1'
      )

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'csv_header_invalid', column: '' })
    })

    it('refuses more data rows than the limit, and accepts exactly the limit', async () => {
      const row = ';Q ?;;Oui;Non;;;1'

      const over = await importCsv(
        csv(...Array.from({ length: QUESTION_IMPORT_MAX_ROWS + 1 }, () => row)),
        {
          query: '?dryRun=true',
        }
      )
      const atLimit = await importCsv(
        csv(...Array.from({ length: QUESTION_IMPORT_MAX_ROWS }, () => row)),
        {
          query: '?dryRun=true',
        }
      )

      expect(over.statusCode).toBe(400)
      expect(parseJson(over)).toEqual({ error: 'csv_too_many_rows' })
      expect(atLimit.statusCode).toBe(200)
      expect(parseJson<DryRunBody>(atLimit).rows).toBe(QUESTION_IMPORT_MAX_ROWS)
    })
  })

  describe('portée et compagnie', () => {
    it('imports an admin file into their own company, whatever scope and company they ask for', async () => {
      const response = await importCsv(csv('Company1 A;Question maison ?;;Oui;Non;;;1'), {
        user: companyAdminUser,
        query: '?scope=global&companyId=2',
      })

      expect(response.statusCode).toBe(201)
      expect(dbState.questions[4]).toMatchObject({
        scope: THEME_SCOPE_COMPANY,
        company_id: 1,
        admin_id: 2,
        question: 'Question maison ?',
      })
    })

    it("does not let a company admin reach another company's themes or the global ones", async () => {
      const before = contentSnapshot()

      const response = await importCsv(
        csv(
          'Company2 A;Chez le voisin ?;;Oui;Non;;;1',
          'Global A;Dans le contenu global ?;;Oui;Non;;;1'
        ),
        { user: companyAdminUser, query: '?scope=global&companyId=2' }
      )

      expect(response.statusCode).toBe(422)
      expect(parseJson(response)).toEqual({
        error: 'csv_invalid',
        errors: [
          { line: 2, column: 'theme', code: 'csv_theme_not_found' },
          { line: 3, column: 'theme', code: 'csv_theme_not_found' },
        ],
      })
      expect(contentSnapshot()).toEqual(before)
    })

    it('lets a superadmin import into a company, with that company themes only', async () => {
      const response = await importCsv(
        csv(
          'Company1 B;Pour la compagnie 1 ?;;Oui;Non;;;1',
          'Global A;Thème global ?;;Oui;Non;;;1'
        ),
        { query: '?scope=company&companyId=1&dryRun=true' }
      )

      expect(parseJson<DryRunBody>(response)).toMatchObject({
        valid: 1,
        errors: [{ line: 3, code: 'csv_theme_not_found' }],
      })

      const created = await importCsv(csv('Company1 B;Pour la compagnie 1 ?;;Oui;Non;;;1'), {
        query: '?scope=company&companyId=1',
      })

      expect(created.statusCode).toBe(201)
      expect(dbState.questions[4]).toMatchObject({ scope: THEME_SCOPE_COMPANY, company_id: 1 })
    })

    it('looks for a global-scope theme among the global themes only', async () => {
      // Thème d'un client portant le nom d'un thème global : le global est choisi, sans ambiguïté.
      dbState.themes.push({ ...dbState.themes[2]!, id: 9, name: 'global a' })

      const response = await importCsv(csv('Global A;Q ?;;Oui;Non;;;1'), { query: '?dryRun=true' })

      expect(parseJson<DryRunBody>(response)).toMatchObject({
        valid: 1,
        errors: [],
        questions: [{ themeIds: [1] }],
      })

      const created = await importCsv(csv('Global A;Q ?;;Oui;Non;;;1'))

      expect(created.statusCode).toBe(201)
      expect(
        dbState.question_themes.filter((link) => link.question_id === 5).map((l) => l.theme_id)
      ).toEqual([1])
    })

    it('does not find a company theme from the global scope', async () => {
      const before = contentSnapshot()

      const response = await importCsv(csv('Company1 A;Q ?;;Oui;Non;;;1'))

      expect(response.statusCode).toBe(422)
      expect(parseJson(response)).toEqual({
        error: 'csv_invalid',
        errors: [{ line: 2, column: 'theme', code: 'csv_theme_not_found' }],
      })
      expect(contentSnapshot()).toEqual(before)
    })

    it('imports a user file as drafts into their own company, whatever the query says', async () => {
      const response = await importCsv(csv('Company2 A;Question du staff ?;;Oui;Non;;;1'), {
        user: companyUser,
        query: '?draft=false&scope=global&companyId=1',
      })

      expect(response.statusCode).toBe(201)
      expect(dbState.questions[4]).toMatchObject({
        id: 5,
        scope: THEME_SCOPE_COMPANY,
        company_id: 2,
        admin_id: 3,
        status: QUESTION_STATUS_DRAFT,
      })

      const answers = dbState.answers.filter((answer) => answer.question_id === 5)

      expect(answers).toHaveLength(2)
      expect(answers.map((answer) => answer.status)).toEqual([
        ANSWER_STATUS_DRAFT,
        ANSWER_STATUS_DRAFT,
      ])
    })

    it('asks a superadmin importing into the company scope for a company', async () => {
      const response = await importCsv(csv('Company1 B;Q ?;;Oui;Non;;;1'), {
        query: '?scope=company',
      })

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'question_company_required' })
    })
  })
})
